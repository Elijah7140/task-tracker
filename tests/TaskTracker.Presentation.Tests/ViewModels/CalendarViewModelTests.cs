using System.Globalization;

using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Calendar;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

using UrgencyLevel = TaskTracker.Core.Urgency.Urgency;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Calendar periods, load ordering, urgency refresh and entry activation.</summary>
public sealed class CalendarViewModelTests
{
    private static readonly CultureInfo English = CultureInfo.GetCultureInfo("en-US");

    private static readonly CultureInfo German = CultureInfo.GetCultureInfo("de-DE");

    private static readonly DateTimeOffset NoonOnTheThirteenth = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Newer_load_replaces_stale_results_and_cancels_older_load()
    {
        var service = new PendingCalendarService();
        using var page = CreatePage(service);
        var first = page.LoadAsync();
        var second = page.MoveAsync(1);
        Assert.True(service.Cancellations[0].IsCancellationRequested);
        var secondDate = service.Queries[1].FromDate;
        service.Complete(1, [CalendarEntries.Due(secondDate, "New")]);
        await second;
        service.Complete(0, [CalendarEntries.Due(service.Queries[0].FromDate, "Old")]);
        await first;

        Assert.Contains(page.Days.SelectMany(day => day.Entries), entry => entry.Entry.Title == "New");
        Assert.DoesNotContain(page.Days.SelectMany(day => day.Entries), entry => entry.Entry.Title == "Old");
    }

    [Fact]
    public async Task Load_failure_is_displayed_inline()
    {
        var service = new PendingCalendarService();
        using var page = CreatePage(service);
        var load = page.LoadAsync();
        service.Fail(0, new InvalidOperationException("Storage unavailable"));

        await load;

        Assert.Contains("Storage unavailable", page.Error);
    }

    [Fact]
    public async Task Month_view_shows_42_days_and_dims_the_ones_outside_the_month()
    {
        var service = new RecordingCalendarService();
        using var page = CreatePage(service, English);

        await page.LoadAsync();

        Assert.Equal(42, page.Days.Count);
        Assert.Equal(30, page.Days.Count(day => !day.IsOutsideMonth));
        Assert.Equal(42, (service.Queries[^1].ToDateExclusive.DayNumber - service.Queries[^1].FromDate.DayNumber));
    }

    [Theory]
    [InlineData("en-US", DayOfWeek.Sunday, 2026, 11, 1)]
    [InlineData("de-DE", DayOfWeek.Monday, 2026, 10, 26)]
    public async Task Month_grid_starts_on_the_cultures_first_day_of_week(
        string cultureName, DayOfWeek expectedWeekday, int year, int month, int day)
    {
        var service = new RecordingCalendarService();
        using var page = CreatePage(service, CultureInfo.GetCultureInfo(cultureName));

        await page.LoadAsync();

        var first = page.Days[0];
        Assert.Equal(new DateOnly(year, month, day), first.Date);
        Assert.Equal(expectedWeekday, first.Date.DayOfWeek);
        Assert.Equal(first.Date, service.Queries[^1].FromDate);
    }

    [Fact]
    public async Task Week_view_shows_seven_days_from_the_cultures_first_day()
    {
        var service = new RecordingCalendarService();
        using var page = CreatePage(service, German);

        await page.SetWeekAsync(true);

        Assert.Equal(7, page.Days.Count);
        Assert.Equal(new DateOnly(2026, 11, 9), page.Days[0].Date);
        Assert.Equal(7, service.Queries[^1].ToDateExclusive.DayNumber - service.Queries[^1].FromDate.DayNumber);
    }

    [Fact]
    public async Task Moving_by_month_from_the_31st_lands_on_the_first_of_the_next_month()
    {
        var service = new RecordingCalendarService();
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 1, 31, 12, 0, 0, TimeSpan.Zero));
        using var page = CreatePage(service, English, clock);

        await page.MoveAsync(1);
        await page.SetWeekAsync(true);

        Assert.Equal(new DateOnly(2026, 2, 1), service.Queries[^1].FromDate);
    }

    [Fact]
    public async Task Moving_a_week_shifts_the_range_by_seven_days()
    {
        var service = new RecordingCalendarService();
        using var page = CreatePage(service, English);
        await page.SetWeekAsync(true);
        var before = service.Queries[^1].FromDate;

        await page.MoveAsync(-1);

        Assert.Equal(before.AddDays(-7), service.Queries[^1].FromDate);
    }

    [Fact]
    public async Task Open_day_shows_the_week_containing_that_day()
    {
        var service = new RecordingCalendarService();
        using var page = CreatePage(service, English);
        await page.LoadAsync();
        var lastDayOfMonthView = page.Days[^1];

        await page.OpenDayAsync(lastDayOfMonthView);

        Assert.True(page.IsWeek);
        Assert.Contains(page.Days, day => day.Date == lastDayOfMonthView.Date);
    }

    [Fact]
    public async Task Project_scope_limits_the_query_and_all_projects_does_not()
    {
        var service = new RecordingCalendarService();
        var projectId = Guid.NewGuid();
        using var page = new CalendarViewModel(service, new FakeNavigationService(),
            new FakeTimeProvider(NoonOnTheThirteenth), TimeZoneInfo.Utc, projectId, English, new ImmediateDispatcher());

        await page.LoadAsync();
        var scoped = service.Queries[^1].ProjectId;
        page.SelectedScope = CalendarViewModel.AllProjectsScope;
        var unscoped = service.Queries[^1].ProjectId;

        Assert.Equal(projectId, scoped);
        Assert.Null(unscoped);
        Assert.Equal([CalendarViewModel.AllProjectsScope, CalendarViewModel.ThisProjectScope], page.ScopeOptions);
    }

    [Fact]
    public async Task Minute_timer_moves_an_entry_from_imminent_to_overdue()
    {
        var service = new RecordingCalendarService
        {
            Entries = [CalendarEntries.Due(new DateOnly(2026, 11, 13), "Due soon", new TimeOnly(14, 0))]
        };
        var clock = new FakeTimeProvider(NoonOnTheThirteenth);
        using var page = CreatePage(service, English, clock);
        await page.LoadAsync();
        var entry = page.Days.SelectMany(day => day.Entries).Single();
        Assert.Equal(UrgencyLevel.Imminent, entry.Urgency);

        clock.Advance(TimeSpan.FromMinutes(121));

        Assert.Equal(UrgencyLevel.Overdue, entry.Urgency);
        Assert.Equal("Overdue", entry.UrgencyLabel);
        Assert.Single(service.Queries);
    }

    [Fact]
    public async Task Today_rolls_over_at_local_midnight_in_a_non_UTC_zone()
    {
        var zone = TimeZoneInfo.CreateCustomTimeZone("Test+10", TimeSpan.FromHours(10), "Test+10", "Test+10");
        var service = new RecordingCalendarService();
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 13, 30, 0, TimeSpan.Zero));
        using var page = new CalendarViewModel(service, new FakeNavigationService(), clock, zone, null,
            English, new ImmediateDispatcher());
        await page.LoadAsync();
        Assert.Equal(new DateOnly(2026, 11, 13), Assert.Single(page.Days, day => day.IsToday).Date);
        var loadsBefore = service.Queries.Count;

        clock.Advance(TimeSpan.FromMinutes(29));
        Assert.Equal(loadsBefore, service.Queries.Count);
        clock.Advance(TimeSpan.FromMinutes(2));

        Assert.Equal(loadsBefore + 1, service.Queries.Count);
        Assert.Equal(new DateOnly(2026, 11, 14), Assert.Single(page.Days, day => day.IsToday).Date);
    }

    [Fact]
    public async Task Activating_an_entry_asks_navigation_to_open_its_item()
    {
        var navigation = new FakeNavigationService();
        var entry = CalendarEntries.Due(new DateOnly(2026, 11, 13));
        var service = new RecordingCalendarService { Entries = [entry] };
        using var page = CreatePage(service, English, navigation: navigation);
        await page.LoadAsync();

        await page.OpenEntryAsync(page.Days.SelectMany(day => day.Entries).Single());

        Assert.Equal(entry.ItemId, navigation.OpenedCalendarItemId);
        Assert.Null(page.Error);
    }

    [Fact]
    public async Task Activating_a_deleted_item_reloads_the_calendar_and_keeps_the_message()
    {
        var navigation = new FakeNavigationService { CalendarItemOutcome = SearchOpenOutcome.ItemMissing };
        var service = new RecordingCalendarService
        {
            Entries = [CalendarEntries.Due(new DateOnly(2026, 11, 13))]
        };
        using var page = CreatePage(service, English, navigation: navigation);
        await page.LoadAsync();
        var loadsBefore = service.Queries.Count;
        service.Entries = [];

        await page.OpenEntryAsync(page.Days.SelectMany(day => day.Entries).Single());

        Assert.Equal("This item no longer exists", page.Error);
        Assert.Equal(loadsBefore + 1, service.Queries.Count);
        Assert.Empty(page.Days.SelectMany(day => day.Entries));
    }

    [Fact]
    public async Task Cancelled_activation_stays_quiet_and_does_not_reload()
    {
        var navigation = new FakeNavigationService { CalendarItemOutcome = SearchOpenOutcome.Cancelled };
        var service = new RecordingCalendarService
        {
            Entries = [CalendarEntries.Due(new DateOnly(2026, 11, 13))]
        };
        using var page = CreatePage(service, English, navigation: navigation);
        await page.LoadAsync();
        var loadsBefore = service.Queries.Count;

        await page.OpenEntryAsync(page.Days.SelectMany(day => day.Entries).Single());

        Assert.Null(page.Error);
        Assert.Equal(loadsBefore, service.Queries.Count);
    }

    [Fact]
    public async Task A_second_activation_while_one_is_pending_is_ignored()
    {
        var navigation = new FakeNavigationService
        {
            CalendarItemGate = new TaskCompletionSource<SearchOpenOutcome>()
        };
        var service = new RecordingCalendarService
        {
            Entries = [CalendarEntries.Due(new DateOnly(2026, 11, 13))]
        };
        using var page = CreatePage(service, English, navigation: navigation);
        await page.LoadAsync();
        var entry = page.Days.SelectMany(day => day.Entries).Single();

        var first = page.OpenEntryAsync(entry);
        await page.OpenEntryAsync(entry);
        navigation.CalendarItemGate.SetResult(SearchOpenOutcome.Opened);
        await first;

        Assert.Equal(1, navigation.CalendarItemRequests);
    }

    [Fact]
    public async Task Activation_answered_after_the_page_is_disposed_changes_nothing()
    {
        var navigation = new FakeNavigationService
        {
            CalendarItemGate = new TaskCompletionSource<SearchOpenOutcome>()
        };
        var service = new RecordingCalendarService
        {
            Entries = [CalendarEntries.Due(new DateOnly(2026, 11, 13))]
        };
        var page = CreatePage(service, English, navigation: navigation);
        await page.LoadAsync();
        var pending = page.OpenEntryAsync(page.Days.SelectMany(day => day.Entries).Single());
        var loadsBefore = service.Queries.Count;
        page.Dispose();

        navigation.CalendarItemGate.SetResult(SearchOpenOutcome.ItemMissing);
        await pending;

        Assert.Null(page.Error);
        Assert.Equal(loadsBefore, service.Queries.Count);
    }

    [Fact]
    public async Task Disposed_page_ignores_timer_ticks_and_further_loads()
    {
        var service = new RecordingCalendarService();
        var clock = new FakeTimeProvider(NoonOnTheThirteenth);
        var page = CreatePage(service, English, clock);
        await page.LoadAsync();
        page.Dispose();
        var loadsBefore = service.Queries.Count;

        clock.Advance(TimeSpan.FromDays(2));
        await page.LoadAsync();

        Assert.Equal(loadsBefore, service.Queries.Count);
    }

    private static CalendarViewModel CreatePage(ICalendarService service, CultureInfo? culture = null,
        FakeTimeProvider? clock = null, FakeNavigationService? navigation = null)
    {
        return new CalendarViewModel(service, navigation ?? new FakeNavigationService(),
            clock ?? new FakeTimeProvider(NoonOnTheThirteenth), TimeZoneInfo.Utc, null,
            culture ?? English, new ImmediateDispatcher());
    }

    private sealed class PendingCalendarService : ICalendarService
    {
        private readonly List<TaskCompletionSource<IReadOnlyList<CalendarEntry>>> pending = [];

        public List<CalendarQuery> Queries { get; } = [];

        public List<CancellationToken> Cancellations { get; } = [];

        public Task<IReadOnlyList<CalendarEntry>> LoadAsync(CalendarQuery query,
            CancellationToken cancellationToken = default)
        {
            Queries.Add(query);
            Cancellations.Add(cancellationToken);
            var completion = new TaskCompletionSource<IReadOnlyList<CalendarEntry>>();
            pending.Add(completion);
            return completion.Task;
        }

        public void Complete(int index, IReadOnlyList<CalendarEntry> entries)
        {
            pending[index].SetResult(entries);
        }

        public void Fail(int index, Exception exception)
        {
            pending[index].SetException(exception);
        }
    }
}