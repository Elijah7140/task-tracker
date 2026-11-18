using System.Collections.ObjectModel;
using System.Globalization;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Calendar;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Read-only month and week calendar with scoped, cancellable loads.</summary>
public sealed class CalendarViewModel : ViewModelBase, IDisposable
{
    /// <summary>Scope label for entries of every project.</summary>
    public const string AllProjectsScope = "All projects";

    /// <summary>Scope label for entries of the project the calendar was opened from.</summary>
    public const string ThisProjectScope = "This project";

    /// <summary>Shown when an entry's item was deleted after the calendar loaded.</summary>
    public const string MissingItemMessage = "This item no longer exists";

    private const int MonthDayCount = 42;
    private const int WeekDayCount = 7;

    private readonly ICalendarService service;
    private readonly ICalendarRescheduler rescheduler;
    private readonly INavigationService navigation;
    private readonly TimeProvider clock;
    private readonly TimeZoneInfo zone;
    private readonly CultureInfo culture;
    private readonly IUiDispatcher dispatcher;
    private readonly Guid? originProjectId;
    private readonly ITimer timer;
    private CancellationTokenSource? loadCancellation;
    private DateOnly anchor;
    private DateOnly displayedToday;
    private bool isWeek;
    private bool includeCompleted;
    private string selectedScope;
    private string? error;
    private int loadVersion;
    private bool isOpeningEntry;
    private bool isMovingEntry;
    private CalendarMoveRequest? pendingMove;
    private CalendarEntryViewModel? lastSavedOccurrence;
    private bool disposed;

    public CalendarViewModel(ICalendarService service, ICalendarRescheduler rescheduler,
        INavigationService navigation, TimeProvider clock, TimeZoneInfo zone, Guid? projectId,
        CultureInfo? culture = null, IUiDispatcher? dispatcher = null)
    {
        this.service = service;
        this.rescheduler = rescheduler;
        this.navigation = navigation;
        this.clock = clock;
        this.zone = zone;
        this.culture = culture ?? CultureInfo.CurrentCulture;
        this.dispatcher = dispatcher ?? new SynchronizationContextDispatcher(SynchronizationContext.Current);
        originProjectId = projectId;
        anchor = Today;
        displayedToday = anchor;
        ScopeOptions = projectId is null ? [AllProjectsScope] : [AllProjectsScope, ThisProjectScope];
        selectedScope = projectId is null ? AllProjectsScope : ThisProjectScope;
        BackCommand = new AsyncRelayCommand(navigation.ReturnFromCalendarAsync);
        PreviousCommand = new AsyncRelayCommand(() => MoveAsync(-1));
        NextCommand = new AsyncRelayCommand(() => MoveAsync(1));
        TodayCommand = new AsyncRelayCommand(GoTodayAsync);
        MonthCommand = new AsyncRelayCommand(() => SetWeekAsync(false));
        WeekCommand = new AsyncRelayCommand(() => SetWeekAsync(true));
        MoreCommand = new AsyncRelayCommand<CalendarDayViewModel>(OpenDayAsync);
        OpenEntryCommand = new AsyncRelayCommand<CalendarEntryViewModel>(OpenEntryAsync);
        timer = clock.CreateTimer(OnTimerTick, null, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1));
    }

    /// <summary>The visible days: 42 in month view, 7 in week view.</summary>
    public ObservableCollection<CalendarDayViewModel> Days { get; } = [];

    public IReadOnlyList<string> ScopeOptions { get; }

    public ICommand BackCommand { get; }

    public ICommand PreviousCommand { get; }

    public ICommand NextCommand { get; }

    public ICommand TodayCommand { get; }

    public ICommand MonthCommand { get; }

    public ICommand WeekCommand { get; }

    /// <summary>Opens the day of a month cell in week view.</summary>
    public ICommand MoreCommand { get; }

    /// <summary>Opens the workspace of an entry's item.</summary>
    public ICommand OpenEntryCommand { get; }

    /// <summary>
    /// Raised after a keyboard move has reloaded the calendar, so the view can focus the moved
    /// entry again; the reload replaced every entry control.
    /// </summary>
    public event EventHandler<CalendarFocusRequest>? FocusEntryRequested;

    /// <summary>Lets Back wait for the active move and its queued steps.</summary>
    internal event Action<Task>? WriteStarted;

    public bool IsWeek => isWeek;

    public bool IsMonth => !isWeek;

    public string Title => isWeek ? WeekTitle() : anchor.ToString("MMMM yyyy", culture);

    public string? Error
    {
        get => error;
        private set => SetProperty(ref error, value);
    }

    public bool IncludeCompleted
    {
        get => includeCompleted;
        set
        {
            if (SetProperty(ref includeCompleted, value))
            {
                _ = LoadAsync();
            }
        }
    }

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
    /// Loads the displayed period. A newer load cancels an older one, and only the newest load
    /// may change <see cref="Days"/> or <see cref="Error"/>.
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
            var entries = await service.LoadAsync(load.Query, load.Cancellation.Token);
            var (statuses, priorities) = await navigation.LoadRowLookupsAsync(load.Cancellation.Token);
            ApplyLoad(load, entries, new RowLookupMenus(statuses, priorities));
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

    /// <summary>Moves one month (anchored on its first day) or one week; the sign gives the direction.</summary>
    public Task MoveAsync(int direction)
    {
        anchor = isWeek ? anchor.AddDays(7 * direction) : FirstOfMonth(anchor).AddMonths(direction);
        OnPropertyChanged(nameof(Title));
        return LoadAsync();
    }

    public Task GoTodayAsync()
    {
        anchor = Today;
        OnPropertyChanged(nameof(Title));
        return LoadAsync();
    }

    public Task SetWeekAsync(bool week)
    {
        isWeek = week;
        OnPropertyChanged(nameof(IsWeek));
        OnPropertyChanged(nameof(IsMonth));
        OnPropertyChanged(nameof(Title));
        return LoadAsync();
    }

    /// <summary>Shows the week that contains the day.</summary>
    public Task OpenDayAsync(CalendarDayViewModel? day)
    {
        if (day is null)
        {
            return Task.CompletedTask;
        }

        anchor = day.Date;
        return SetWeekAsync(true);
    }

    /// <summary>
    /// Opens the entry's workspace. Only one activation runs at a time, and a result that arrives
    /// after the page was left is ignored. A deleted item reloads the calendar and says so.
    /// </summary>
    public async Task OpenEntryAsync(CalendarEntryViewModel? occurrence)
    {
        if (occurrence is null || disposed || isOpeningEntry)
        {
            return;
        }

        isOpeningEntry = true;

        try
        {
            var outcome = await navigation.OpenCalendarItemAsync(occurrence.Entry.ItemId);

            if (!disposed && outcome == SearchOpenOutcome.ItemMissing)
            {
                await ReloadAndReportMissingItemAsync();
            }
        }
        catch (Exception exception)
        {
            if (!disposed)
            {
                Error = $"Something went wrong: {exception.Message}";
            }
        }
        finally
        {
            isOpeningEntry = false;
        }
    }

    /// <summary>
    /// Applies a drop: saves the change it asks for, then reloads. A drop that changes nothing saves
    /// nothing. A rule failure (for example a deleted item) reloads and then shows the reason.
    /// While a move is saving, a newer one waits and runs afterwards; the returned task of a waiting
    /// move completes at once, and the task of the move that is running completes after them all.
    /// </summary>
    public Task MoveEntryAsync(CalendarEntryViewModel? occurrence, CalendarDropTarget target)
    {
        if (occurrence is null)
        {
            return Task.CompletedTask;
        }

        return RunMoveAsync(CalendarMoveRequest.ForDrop(occurrence, target));
    }

    /// <summary>
    /// The keyboard equivalent of a drop: moves the entry by whole days and/or minutes, then asks the
    /// view to focus the entry again. All-day entries ignore minute steps. Steps that arrive while a
    /// move is saving are added together and applied to the reloaded entry.
    /// </summary>
    public Task MoveEntryByAsync(CalendarEntryViewModel? occurrence, int dayDelta, int minuteDelta)
    {
        if (occurrence is null)
        {
            return Task.CompletedTask;
        }

        return RunMoveAsync(CalendarMoveRequest.ForStep(occurrence, dayDelta, minuteDelta));
    }

    public void Dispose()
    {
        disposed = true;
        loadVersion++;
        loadCancellation?.Cancel();
        loadCancellation?.Dispose();
        loadCancellation = null;
        timer.Dispose();
    }

    private DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime);

    private DateOnly WeekStart => CalendarLayout.StartOfWeek(anchor, culture.DateTimeFormat.FirstDayOfWeek);

    private static DateOnly FirstOfMonth(DateOnly day)
    {
        return new DateOnly(day.Year, day.Month, 1);
    }

    private string WeekTitle()
    {
        return CalendarLayout.WeekTitle(WeekStart, culture);
    }

    private CalendarQuery CreateQuery()
    {
        var firstDay = culture.DateTimeFormat.FirstDayOfWeek;
        var start = isWeek ? WeekStart : CalendarLayout.StartOfWeek(FirstOfMonth(anchor), firstDay);
        var end = start.AddDays(isWeek ? WeekDayCount : MonthDayCount);
        var projectId = selectedScope == ThisProjectScope ? originProjectId : null;
        return new CalendarQuery(projectId, start, end, includeCompleted);
    }

    private LoadRequest StartLoad()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        Error = null;
        return new LoadRequest(++loadVersion, CreateQuery(), cancellation);
    }

    private bool IsCurrent(LoadRequest load)
    {
        return !disposed && load.Version == loadVersion;
    }

    private void ApplyLoad(LoadRequest load, IReadOnlyList<CalendarEntry> entries, RowLookupMenus menus)
    {
        if (IsCurrent(load))
        {
            ShowDays(load.Query, entries, menus);
        }
    }

    private void ReportLoadError(LoadRequest load, Exception exception)
    {
        if (IsCurrent(load))
        {
            Error = $"Something went wrong: {exception.Message}";
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

    private Task RunMoveAsync(CalendarMoveRequest request)
    {
        if (disposed)
        {
            return Task.CompletedTask;
        }

        pendingMove = pendingMove is null ? request : pendingMove.Merge(request);

        if (isMovingEntry)
        {
            return Task.CompletedTask;
        }

        var write = SavePendingMovesAsync();
        WriteStarted?.Invoke(write);
        return write;
    }

    private async Task SavePendingMovesAsync()
    {
        isMovingEntry = true;

        try
        {
            await ApplyPendingMovesAsync();
        }
        finally
        {
            isMovingEntry = false;
        }
    }

    private async Task ApplyPendingMovesAsync()
    {
        while (pendingMove is CalendarMoveRequest next && !disposed)
        {
            pendingMove = null;
            await ApplyMoveAsync(next);
        }
    }

    /// <summary>Plans, saves and reloads one move. Every failure is shown; none escapes to the caller.</summary>
    private async Task ApplyMoveAsync(CalendarMoveRequest request)
    {
        try
        {
            var occurrence = CurrentOccurrenceOf(request);
            var move = PlanMove(request, occurrence);

            if (move.IsNone)
            {
                return;
            }

            await SaveMoveAsync(occurrence.Entry.ItemId, move);
            lastSavedOccurrence = CalendarReschedule.AfterMove(occurrence, move);
            await LoadAsync();
            RequestFocus(request, occurrence, move);
        }
        catch (DomainRuleException exception)
        {
            pendingMove = null;
            await ReloadAndReportAsync(exception.Message);
        }
        catch (Exception exception)
        {
            pendingMove = null;
            ReportFailure(exception);
        }
    }

    /// <summary>
    /// The entry of the request as the latest load shows it, preferring the same day. When the entry is
    /// not shown (it left the visible period), the state the last saved move left it in is used, so a
    /// queued step continues from there. Failing that, the occurrence the gesture started on is used so
    /// the service can report why the move failed.
    /// </summary>
    private CalendarEntryViewModel CurrentOccurrenceOf(CalendarMoveRequest request)
    {
        var matches = Days.SelectMany(day => day.Entries)
            .Where(candidate => KeyOf(candidate) == request.Key)
            .ToArray();
        var sameDay = matches.FirstOrDefault(candidate => candidate.Day == request.Occurrence.Day);
        return sameDay ?? matches.FirstOrDefault() ?? LastSavedOccurrenceOf(request) ?? request.Occurrence;
    }

    private CalendarEntryViewModel? LastSavedOccurrenceOf(CalendarMoveRequest request)
    {
        var saved = lastSavedOccurrence;
        return saved is not null && KeyOf(saved) == request.Key ? saved : null;
    }

    private static CalendarEntryKey KeyOf(CalendarEntryViewModel occurrence)
    {
        return new CalendarEntryKey(occurrence.Entry.ItemId, occurrence.Entry.Kind);
    }

    private static CalendarMove PlanMove(CalendarMoveRequest request, CalendarEntryViewModel occurrence)
    {
        var target = request.TargetFor(occurrence);

        if (target is null)
        {
            return CalendarMove.None;
        }

        return CalendarReschedule.Plan(occurrence, target.Value);
    }

    private Task SaveMoveAsync(Guid itemId, CalendarMove move)
    {
        if (move.Kind == CalendarMoveKind.Due)
        {
            return rescheduler.MoveDueAsync(itemId, move.Date, move.Time);
        }

        return rescheduler.MoveScheduleAsync(itemId, move.Start);
    }

    private void RequestFocus(CalendarMoveRequest request, CalendarEntryViewModel occurrence, CalendarMove move)
    {
        if (request.RestoreFocus && !disposed)
        {
            FocusEntryRequested?.Invoke(this, new CalendarFocusRequest(KeyOf(occurrence), move.TargetDay));
        }
    }

    private void ReportFailure(Exception exception)
    {
        if (!disposed)
        {
            Error = $"Something went wrong: {exception.Message}";
        }
    }

    private async Task ReloadAndReportAsync(string message)
    {
        await LoadAsync();

        if (!disposed)
        {
            Error = message;
        }
    }

    private Task ReloadAndReportMissingItemAsync()
    {
        return ReloadAndReportAsync(MissingItemMessage);
    }

    private void ShowDays(CalendarQuery query, IReadOnlyList<CalendarEntry> entries, RowLookupMenus menus)
    {
        displayedToday = Today;
        var dayCount = isWeek ? WeekDayCount : MonthDayCount;
        var days = CalendarLayout.BuildDays(query.FromDate, dayCount, anchor, displayedToday, entries, culture);
        Days.Clear();

        foreach (var day in days)
        {
            foreach (var entry in day.Entries)
            {
                AttachRowActions(entry, menus);
            }

            Days.Add(day);
        }

        RefreshUrgency();
    }

    /// <summary>Wires an entry's context menu: push back, Set status and Set priority.</summary>
    private void AttachRowActions(CalendarEntryViewModel entry, RowLookupMenus menus)
    {
        var item = entry.Entry;
        entry.PushBackCommand = new AsyncRelayCommand(() => navigation.PushBackAsync(item.ItemId),
            () => entry.PushBackReason is null);
        entry.StatusName = menus.StatusName(item.StatusId);
        entry.StatusChoices = menus.Statuses(item.StatusId,
            id => navigation.SetRowStatusAsync(item.ItemId, id));
        entry.PriorityChoices = menus.Priorities(item.PriorityLevelId,
            id => navigation.SetRowPriorityAsync(item.ItemId, id));
    }

    private void OnTimerTick(object? state)
    {
        dispatcher.Post(RefreshOrReload);
    }

    /// <summary>Reloads when local midnight has passed; otherwise only re-evaluates urgency.</summary>
    private void RefreshOrReload()
    {
        if (disposed)
        {
            return;
        }

        if (Today != displayedToday)
        {
            _ = LoadAsync();
            return;
        }

        RefreshUrgency();
    }

    private void RefreshUrgency()
    {
        var now = clock.GetUtcNow().UtcDateTime;

        foreach (var day in Days)
        {
            foreach (var entry in day.Entries)
            {
                entry.RefreshUrgency(now, zone);
            }
        }
    }

    private sealed record LoadRequest(int Version, CalendarQuery Query, CancellationTokenSource Cancellation);
}