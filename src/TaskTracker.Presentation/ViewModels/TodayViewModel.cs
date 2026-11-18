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
    private static readonly TimeSpan DayCheckInterval = TimeSpan.FromMinutes(1);

    private readonly TodayService service;
    private readonly ItemService items;
    private readonly DataSaved saves;
    private readonly IUiDispatcher dispatcher;
    private readonly INavigationService navigation;
    private readonly ITimer timer;
    private Dictionary<Guid, TodayRowViewModel> rows = [];
    private RowLookupMenus rowMenus = new([], []);
    private IReadOnlyList<TodayProjectViewModel> projects = [];
    private string? error;
    private int loadVersion;
    private DateOnly? shownDay;
    private DateOnly? loadingDay;
    private bool disposed;

    public TodayViewModel(TodayService service, ItemService items, DataSaved saves, TimeProvider clock,
        IUiDispatcher dispatcher, INavigationService navigation)
    {
        this.service = service;
        this.items = items;
        this.saves = saves;
        this.dispatcher = dispatcher;
        this.navigation = navigation;
        BackCommand = new AsyncRelayCommand(navigation.ReturnFromTodayAsync);
        timer = clock.CreateTimer(_ => dispatcher.Post(CheckDay), null, DayCheckInterval, DayCheckInterval);
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

    /// <summary>Lets Back wait for a reopen even if another transient page replaces Today.</summary>
    internal event Action<Task>? WriteStarted;

    /// <summary>Refreshes the view after a local date change, including when the window wakes or is activated.</summary>
    public Task RefreshIfDayChangedAsync()
    {
        var day = service.LocalDay;
        return day == (loadingDay ?? shownDay) ? Task.CompletedTask : LoadAsync(day);
    }

    public Task LoadAsync()
    {
        return LoadAsync(service.LocalDay);
    }

    private async Task LoadAsync(DateOnly day)
    {
        if (disposed)
        {
            return;
        }

        var version = ++loadVersion;
        loadingDay = day;
        try
        {
            var found = await service.LoadForDayAsync(day);
            var (statuses, priorities) = await navigation.LoadRowLookupsAsync();
            if (!disposed && version == loadVersion)
            {
                shownDay = day;
                rowMenus = new RowLookupMenus(statuses, priorities);
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
        finally
        {
            if (version == loadVersion)
            {
                loadingDay = null;
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

    internal Task SetCurrentAsync(Guid id)
    {
        return disposed ? Task.CompletedTask : navigation.SetCurrentItemAsync(id);
    }

    internal Task ReopenAsync(TodayRowViewModel row)
    {
        if (disposed)
        {
            return Task.CompletedTask;
        }

        var write = SaveReopenAsync(row);
        WriteStarted?.Invoke(write);
        return write;
    }

    private async Task SaveReopenAsync(TodayRowViewModel row)
    {
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

        var row = new TodayRowViewModel(item, this, nested, expanded)
        {
            StatusName = rowMenus.StatusName(item.StatusId),
            StatusChoices = rowMenus.Statuses(item.StatusId, id => navigation.SetRowStatusAsync(item.Id, id)),
            PriorityChoices = rowMenus.Priorities(item.PriorityLevelId, id => navigation.SetRowPriorityAsync(item.Id, id))
        };
        rows.Add(item.Id, row);
        return row;
    }

    private async void CheckDay()
    {
        await RefreshIfDayChangedAsync();
    }

    private void OnSaved()
    {
        dispatcher.Post(Refresh);
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