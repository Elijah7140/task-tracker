using System.Collections.ObjectModel;
using System.Globalization;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Trash;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Lists deletion batches and restores or permanently deletes them (§7.6).</summary>
public sealed class TrashViewModel : ViewModelBase, IDisposable
{
    /// <summary>Scope label for the batches of every project.</summary>
    public const string AllProjectsScope = "All projects";

    /// <summary>Scope label for the batches of the project the trash was opened from.</summary>
    public const string ThisProjectScope = "This project";

    private readonly ITrashService service;
    private readonly IDialogService dialogs;
    private readonly TimeZoneInfo zone;
    private readonly CultureInfo culture;
    private readonly Guid? originProjectId;
    private readonly AsyncRelayCommand emptyCommand;
    private CancellationTokenSource? loadCancellation;
    private string selectedScope;
    private string? error;
    private int loadVersion;
    private bool hasLoaded;
    private bool isWorking;
    private bool restoreStarted;
    private bool disposed;

    public TrashViewModel(ITrashService service, IDialogService dialogs, INavigationService navigation,
        TimeZoneInfo zone, Guid? projectId, CultureInfo? culture = null)
    {
        this.service = service;
        this.dialogs = dialogs;
        this.zone = zone;
        this.culture = culture ?? CultureInfo.CurrentCulture;
        originProjectId = projectId;
        ScopeOptions = projectId is null ? [AllProjectsScope] : [AllProjectsScope, ThisProjectScope];
        selectedScope = projectId is null ? AllProjectsScope : ThisProjectScope;
        BackCommand = new AsyncRelayCommand(navigation.ReturnFromTrashAsync);
        RestoreCommand = new AsyncRelayCommand<TrashBatchViewModel>(RestoreAsync);
        PurgeCommand = new AsyncRelayCommand<TrashBatchViewModel>(PurgeAsync);
        emptyCommand = new AsyncRelayCommand(EmptyAsync, () => Batches.Count > 0);
        Batches.CollectionChanged += (_, _) => OnBatchesChanged();
    }

    /// <summary>The deletion batches in scope, newest first.</summary>
    public ObservableCollection<TrashBatchViewModel> Batches { get; } = [];

    public IReadOnlyList<string> ScopeOptions { get; }

    public ICommand BackCommand { get; }

    /// <summary>Restores the batch given as the command parameter.</summary>
    public ICommand RestoreCommand { get; }

    /// <summary>Permanently deletes the batch given as the command parameter, after a confirmation.</summary>
    public ICommand PurgeCommand { get; }

    /// <summary>Permanently deletes every batch in scope, after a confirmation.</summary>
    public ICommand EmptyCommand => emptyCommand;

    /// <summary>
    /// True once a restore was started (even one that is still running or failed), so the page
    /// behind the trash may be out of date and needs a refresh.
    /// </summary>
    public bool MayHaveRestored => restoreStarted;

    /// <summary>True while a restore, permanent deletion or its confirmation is in progress; the shell ignores Back then.</summary>
    public bool IsWorking => isWorking;

    /// <summary>True after a load found nothing in scope.</summary>
    public bool ShowEmpty => hasLoaded && Batches.Count == 0;

    public string? Error
    {
        get => error;
        private set
        {
            if (SetProperty(ref error, value))
            {
                OnPropertyChanged(nameof(HasError));
            }
        }
    }

    public bool HasError => error is not null;

    public string SelectedScope
    {
        get => selectedScope;
        set
        {
            if (SetProperty(ref selectedScope, value))
            {
                _ = LoadAsync();
            }
        }
    }

    /// <summary>
    /// Loads the batches in scope. A newer load cancels an older one, and only the newest load
    /// may change <see cref="Batches"/> or <see cref="Error"/>.
    /// </summary>
    public async Task LoadAsync()
    {
        if (disposed)
        {
            return;
        }

        var load = StartLoad();

        try
        {
            var batches = await service.ListAsync(load.Scope, load.Cancellation.Token);
            ApplyLoad(load, batches);
        }
        catch (OperationCanceledException) when (load.Cancellation.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            ReportLoadError(load, exception);
        }
        finally
        {
            FinishLoad(load);
        }
    }

    /// <summary>Restores one batch; Restore is unavailable while the batch's parent is still deleted.</summary>
    public async Task RestoreAsync(TrashBatchViewModel? row)
    {
        if (row is null || !row.CanRestore || !TryBeginWork())
        {
            return;
        }

        try
        {
            restoreStarted = true;
            OnPropertyChanged(nameof(MayHaveRestored));
            await ChangeAndReloadAsync(() => service.RestoreAsync(row.BatchId));
        }
        finally
        {
            EndWork();
        }
    }

    /// <summary>Permanently deletes one batch once the user confirms (Cancel is the default button).</summary>
    public async Task PurgeAsync(TrashBatchViewModel? row)
    {
        if (row is null || !TryBeginWork())
        {
            return;
        }

        try
        {
            var message = PurgeMessage(row);

            if (await dialogs.ConfirmAsync("Delete permanently", message, "Delete permanently", cancelIsDefault: true))
            {
                await ChangeAndReloadAsync(() => service.PurgeAsync(row.BatchId));
            }
        }
        finally
        {
            EndWork();
        }
    }

    /// <summary>Permanently deletes everything in scope once the user confirms (Cancel is the default button).</summary>
    public async Task EmptyAsync()
    {
        if (Batches.Count == 0 || !TryBeginWork())
        {
            return;
        }

        try
        {
            var scope = CurrentScope();

            if (await dialogs.ConfirmAsync("Empty trash", EmptyMessage(), "Empty trash", cancelIsDefault: true))
            {
                await ChangeAndReloadAsync(() => service.EmptyAsync(scope));
            }
        }
        finally
        {
            EndWork();
        }
    }

    /// <summary>Cancels a load in flight and ignores everything that finishes afterwards.</summary>
    public void Dispose()
    {
        disposed = true;
        loadVersion++;
        loadCancellation?.Cancel();
        loadCancellation?.Dispose();
        loadCancellation = null;
    }

    /// <summary>Claims the page for one change at a time; false when another is running or the page is gone.</summary>
    private bool TryBeginWork()
    {
        if (isWorking || disposed)
        {
            return false;
        }

        isWorking = true;
        OnPropertyChanged(nameof(IsWorking));
        return true;
    }

    private void EndWork()
    {
        isWorking = false;
        OnPropertyChanged(nameof(IsWorking));
    }

    /// <summary>
    /// Runs one change, shows a failure inline, and reloads the list either way, because a
    /// failed change often means the list was out of date.
    /// </summary>
    private async Task ChangeAndReloadAsync(Func<Task> change)
    {
        Error = null;
        string? failure = null;

        try
        {
            await change();
        }
        catch (Exception exception)
        {
            failure = DescribeFailure(exception);
        }

        await LoadAsync();
        ShowFailure(failure);
    }

    private static string DescribeFailure(Exception exception)
    {
        if (exception is DomainRuleException)
        {
            return exception.Message;
        }

        return $"Something went wrong: {exception.Message}";
    }

    private string PurgeMessage(TrashBatchViewModel row)
    {
        var kind = row.KindLabel.ToLowerInvariant();
        var message = $"Permanently delete the {kind} '{row.Title}' and everything deleted with it?";

        if (row.Kind == TrashNodeKind.Project)
        {
            message += EarlierEntriesNote(row);
        }

        return message + " This cannot be undone.";
    }

    /// <summary>Purging a project also removes the entries deleted from it earlier; they are separate rows.</summary>
    private string EarlierEntriesNote(TrashBatchViewModel project)
    {
        var earlier = Batches.Count(row => row.ProjectId == project.ProjectId && row.BatchId != project.BatchId);

        if (earlier == 0)
        {
            return string.Empty;
        }

        return $" This also deletes the {Count(earlier)} deleted from this project earlier.";
    }

    private string EmptyMessage()
    {
        return $"Permanently delete {Count(Batches.Count)} in the trash? This cannot be undone.";
    }

    private static string Count(int entries)
    {
        return entries == 1 ? "1 entry" : $"{entries} entries";
    }

    private void ShowFailure(string? failure)
    {
        if (failure is not null && !disposed)
        {
            Error = failure;
        }
    }

    private TrashScope CurrentScope()
    {
        if (selectedScope == ThisProjectScope && originProjectId is Guid projectId)
        {
            return TrashScope.ForProject(projectId);
        }

        return TrashScope.AllProjects;
    }

    private LoadRequest StartLoad()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        Error = null;
        return new LoadRequest(++loadVersion, CurrentScope(), cancellation);
    }

    private bool IsCurrent(LoadRequest load)
    {
        return !disposed && load.Version == loadVersion;
    }

    private void ApplyLoad(LoadRequest load, IReadOnlyList<TrashBatch> batches)
    {
        if (!IsCurrent(load))
        {
            return;
        }

        Batches.Clear();

        foreach (var batch in batches)
        {
            Batches.Add(new TrashBatchViewModel(batch, zone, culture));
        }

        hasLoaded = true;
        OnPropertyChanged(nameof(ShowEmpty));
    }

    private void ReportLoadError(LoadRequest load, Exception exception)
    {
        if (IsCurrent(load))
        {
            Error = DescribeFailure(exception);
        }
    }

    private void FinishLoad(LoadRequest load)
    {
        if (ReferenceEquals(loadCancellation, load.Cancellation))
        {
            loadCancellation = null;
        }

        load.Cancellation.Dispose();
    }

    private void OnBatchesChanged()
    {
        OnPropertyChanged(nameof(ShowEmpty));
        emptyCommand.NotifyCanExecuteChanged();
    }

    private sealed record LoadRequest(int Version, TrashScope Scope, CancellationTokenSource Cancellation);
}