using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Completion;
using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Today;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Displays today's completion tree and keeps it current while the page is open.</summary>
public sealed class TodayViewModel : ViewModelBase, IDisposable
{
    private readonly TodayService service;
    private readonly ItemService items;
    private readonly DataSaved saves;
    private readonly TimeProvider clock;
    private readonly IUiDispatcher dispatcher;
    private readonly INavigationService navigation;
    private readonly ITimer timer;
    private Dictionary<Guid, TodayRowViewModel> rows = [];
    private IReadOnlyList<TodayProjectViewModel> projects = [];
    private string? error;
    private int loadVersion;
    private bool disposed;

    public TodayViewModel(TodayService service, ItemService items, DataSaved saves, TimeProvider clock,
        IUiDispatcher dispatcher, INavigationService navigation)
    {
        this.service = service;
        this.items = items;
        this.saves = saves;
        this.clock = clock;
        this.dispatcher = dispatcher;
        this.navigation = navigation;
        BackCommand = new AsyncRelayCommand(navigation.ReturnFromTodayAsync);
        timer = clock.CreateTimer(_ => dispatcher.Post(Refresh), null,
            Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        saves.Committed += OnSaved;
    }

    public ICommand BackCommand { get; }

    public IReadOnlyList<TodayProjectViewModel> Projects
    {
        get => projects;
        private set => SetProperty(ref projects, value);
    }

    public int CompletedCount { get; private set; }

    public bool IsEmpty => CompletedCount == 0;

    public string? Error
    {
        get => error;
        private set => SetProperty(ref error, value);
    }

    /// <summary>Signals that the page behind Today may need to reload when it is shown again.</summary>
    internal event Action? SavedWhileOpen;

    public async Task LoadAsync()
    {
        if (disposed)
        {
            return;
        }

        var version = ++loadVersion;
        ScheduleMidnight();
        try
        {
            var found = await service.LoadAsync();
            if (!disposed && version == loadVersion)
            {
                ApplyResults(found);
            }
        }
        catch (Exception exception)
        {
            if (!disposed && version == loadVersion)
            {
                Error = exception.Message;
            }
        }
    }

    internal async Task OpenAsync(Guid id)
    {
        if (!disposed && await navigation.OpenTodayItemAsync(id) == SearchOpenOutcome.ItemMissing && !disposed)
        {
            await LoadAsync();
            Error = "This item no longer exists.";
        }
    }

    internal Task PushBackAsync(Guid id)
    {
        return disposed ? Task.CompletedTask : navigation.PushBackAsync(id);
    }

    internal async Task ReopenAsync(TodayRowViewModel row)
    {
        if (disposed)
        {
            return;
        }

        try
        {
            var item = row.Item;
            var result = await items.SetCompletedAsync(item.ProjectId, item.FolderId, item.Id, completed: false);
            Error = result is CompletionResult.Blocked blocked ? blocked.Reason : null;
        }
        catch (Exception exception)
        {
            Error = exception.Message;
        }
        finally
        {
            row.RestoreCheckBox();
        }
    }

    private void ApplyResults(IReadOnlyList<TodayItem> found)
    {
        var previous = rows;
        rows = [];
        var groups = found.GroupBy(item => (item.ProjectId, item.ProjectName, item.ProjectOrder))
            .OrderBy(group => group.Key.ProjectOrder)
            .ThenBy(group => group.Key.ProjectName, StringComparer.CurrentCultureIgnoreCase)
            .ThenBy(group => group.Key.ProjectId);

        Projects = groups.Select(group => BuildProject(group.Key.ProjectName, group, previous)).ToArray();
        CompletedCount = found.Count(item => item.CompletedToday);
        OnPropertyChanged(nameof(CompletedCount));
        OnPropertyChanged(nameof(IsEmpty));
        Error = null;
    }

    private TodayProjectViewModel BuildProject(string name, IEnumerable<TodayItem> itemsInProject,
        Dictionary<Guid, TodayRowViewModel> previous)
    {
        var areas = itemsInProject.GroupBy(item => (item.FolderId, item.AreaPath))
            .OrderBy(area => area.Key.FolderId is not null)
            .ThenBy(area => area.Key.AreaPath, StringComparer.CurrentCultureIgnoreCase)
            .ThenBy(area => area.Key.FolderId)
            .Select(area => BuildArea(area.Key.AreaPath, area, previous)).ToArray();
        return new TodayProjectViewModel(name, areas);
    }

    private TodayAreaViewModel BuildArea(string path, IEnumerable<TodayItem> itemsInArea,
        Dictionary<Guid, TodayRowViewModel> previous)
    {
        var ordered = itemsInArea.OrderBy(item => item.SortOrder).ThenBy(item => item.Id).ToArray();
        var children = ordered.ToLookup(item => item.ParentItemId);
        var ids = ordered.Select(item => item.Id).ToHashSet();
        var roots = ordered.Where(item => item.ParentItemId is not Guid parent || !ids.Contains(parent));
        return new TodayAreaViewModel(path, roots.Select(item => BuildRow(item, children, previous)).ToArray());
    }

    private TodayRowViewModel BuildRow(TodayItem item, ILookup<Guid?, TodayItem> children,
        Dictionary<Guid, TodayRowViewModel> previous)
    {
        var nested = children[item.Id].Select(child => BuildRow(child, children, previous)).ToArray();
        var expanded = !item.IsCompleted;
        if (item.IsCompleted && previous.TryGetValue(item.Id, out var old) && old.IsCompleted)
        {
            expanded = old.IsExpanded;
        }

        var row = new TodayRowViewModel(item, this, nested, expanded);
        rows.Add(item.Id, row);
        return row;
    }

    private void ScheduleMidnight()
    {
        var delay = service.NextMidnight - clock.GetUtcNow();
        timer.Change(delay > TimeSpan.Zero ? delay : TimeSpan.Zero, Timeout.InfiniteTimeSpan);
    }

    private void OnSaved()
    {
        dispatcher.Post(() =>
        {
            if (!disposed)
            {
                SavedWhileOpen?.Invoke();
                Refresh();
            }
        });
    }

    private async void Refresh()
    {
        await LoadAsync();
    }

    public void Dispose()
    {
        disposed = true;
        saves.Committed -= OnSaved;
        timer.Dispose();
    }
}