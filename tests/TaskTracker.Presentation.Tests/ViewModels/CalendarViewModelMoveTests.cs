using System.Globalization;

using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core;
using TaskTracker.Core.Calendar;
using TaskTracker.Presentation.ViewModels;

using UrgencyLevel = TaskTracker.Core.Urgency.Urgency;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Dropping and nudging calendar entries: what is saved, what reloads, and what the page reports.</summary>
public sealed class CalendarViewModelMoveTests
{
    private static readonly CultureInfo English = CultureInfo.GetCultureInfo("en-US");

    private static readonly DateTimeOffset NoonOnTheThirteenth = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);

    private static readonly DateOnly TheThirteenth = new(2026, 11, 13);

    private static readonly DateOnly TheFifteenth = new(2026, 11, 15);

    [Fact]
    public async Task Dropping_a_due_entry_on_another_day_saves_the_new_date_and_keeps_the_time()
    {
        var entry = CalendarEntries.Due(TheThirteenth, time: new TimeOnly(10, 30));
        using var scenario = await Scenario.CreateAsync(entry);

        await scenario.Page.MoveEntryAsync(scenario.Occurrence, MonthCell(TheFifteenth));

        var move = Assert.Single(scenario.Rescheduler.DueMoves);
        Assert.Equal(new RecordingCalendarRescheduler.DueMove(entry.ItemId, TheFifteenth, new TimeOnly(10, 30)), move);
        Assert.Empty(scenario.Rescheduler.ScheduleMoves);
    }

    [Fact]
    public async Task Dropping_a_schedule_on_another_day_saves_the_shifted_start()
    {
        var entry = CalendarEntries.Scheduled(new DateTime(2026, 11, 13, 9, 0, 0), new DateTime(2026, 11, 13, 10, 0, 0));
        using var scenario = await Scenario.CreateAsync(entry);

        await scenario.Page.MoveEntryAsync(scenario.Occurrence, MonthCell(TheFifteenth));

        var move = Assert.Single(scenario.Rescheduler.ScheduleMoves);
        Assert.Equal(new RecordingCalendarRescheduler.ScheduleMove(entry.ItemId, new DateTime(2026, 11, 15, 9, 0, 0)), move);
        Assert.Empty(scenario.Rescheduler.DueMoves);
    }

    [Fact]
    public async Task Dropping_an_entry_where_it_already_is_saves_and_reloads_nothing()
    {
        using var scenario = await Scenario.CreateAsync(CalendarEntries.Due(TheThirteenth));
        var loadsBefore = scenario.Service.Queries.Count;

        await scenario.Page.MoveEntryAsync(scenario.Occurrence, MonthCell(TheThirteenth));

        Assert.Empty(scenario.Rescheduler.DueMoves);
        Assert.Equal(loadsBefore, scenario.Service.Queries.Count);
    }

    [Fact]
    public async Task Dropping_a_schedule_on_the_all_day_row_saves_nothing()
    {
        var entry = CalendarEntries.Scheduled(new DateTime(2026, 11, 13, 9, 0, 0), null);
        using var scenario = await Scenario.CreateAsync(entry);
        await scenario.Page.SetWeekAsync(true);
        var block = scenario.FindOccurrence();

        await scenario.Page.MoveEntryAsync(block, new CalendarDropTarget(CalendarDropZone.AllDayRow, TheFifteenth, null));

        Assert.Empty(scenario.Rescheduler.ScheduleMoves);
        Assert.Null(scenario.Page.Error);
    }

    [Fact]
    public async Task A_successful_move_reloads_and_shows_the_entry_in_its_new_place()
    {
        var entry = CalendarEntries.Due(TheThirteenth, "Pay invoice");
        using var scenario = await Scenario.CreateAsync(entry);
        scenario.Rescheduler.AfterMove = () => scenario.Service.Entries = [CalendarEntries.Due(TheFifteenth, "Pay invoice",
            itemId: entry.ItemId)];
        var loadsBefore = scenario.Service.Queries.Count;

        await scenario.Page.MoveEntryAsync(scenario.Occurrence, MonthCell(TheFifteenth));

        Assert.Equal(loadsBefore + 1, scenario.Service.Queries.Count);
        Assert.Empty(scenario.Page.Days.Single(day => day.Date == TheThirteenth).Entries);
        Assert.Single(scenario.Page.Days.Single(day => day.Date == TheFifteenth).Entries);
        Assert.Null(scenario.Page.Error);
    }

    [Fact]
    public async Task A_move_into_the_past_recomputes_the_urgency_of_the_reloaded_entry()
    {
        var entry = CalendarEntries.Due(TheThirteenth.AddDays(10), "Far away");
        using var scenario = await Scenario.CreateAsync(entry);
        var yesterday = TheThirteenth.AddDays(-1);
        scenario.Rescheduler.AfterMove = () => scenario.Service.Entries = [CalendarEntries.Due(yesterday, "Far away",
            itemId: entry.ItemId)];
        Assert.Equal(UrgencyLevel.None, scenario.Occurrence.Urgency);

        await scenario.Page.MoveEntryAsync(scenario.Occurrence, MonthCell(yesterday));

        var reloaded = scenario.FindOccurrence();
        Assert.Equal(UrgencyLevel.Overdue, reloaded.Urgency);
        Assert.Equal("Overdue", reloaded.UrgencyLabel);
    }

    [Fact]
    public async Task A_rule_failure_reloads_the_calendar_then_shows_the_reason()
    {
        using var scenario = await Scenario.CreateAsync(CalendarEntries.Due(TheThirteenth));
        scenario.Rescheduler.Failure = new DomainRuleException("Item is missing or deleted.");
        scenario.Rescheduler.AfterMove = null;
        var loadsBefore = scenario.Service.Queries.Count;
        scenario.Service.Entries = [];

        await scenario.Page.MoveEntryAsync(scenario.Occurrence, MonthCell(TheFifteenth));

        Assert.Equal(loadsBefore + 1, scenario.Service.Queries.Count);
        Assert.Equal("Item is missing or deleted.", scenario.Page.Error);
        Assert.Empty(scenario.Page.Days.SelectMany(day => day.Entries));
    }

    [Fact]
    public async Task An_unexpected_failure_is_shown_without_reloading()
    {
        using var scenario = await Scenario.CreateAsync(CalendarEntries.Due(TheThirteenth));
        scenario.Rescheduler.Failure = new InvalidOperationException("Storage unavailable");
        var loadsBefore = scenario.Service.Queries.Count;

        await scenario.Page.MoveEntryAsync(scenario.Occurrence, MonthCell(TheFifteenth));

        Assert.Contains("Storage unavailable", scenario.Page.Error);
        Assert.Equal(loadsBefore, scenario.Service.Queries.Count);
    }

    [Fact]
    public async Task A_disposed_page_ignores_moves()
    {
        using var scenario = await Scenario.CreateAsync(CalendarEntries.Due(TheThirteenth));
        var occurrence = scenario.Occurrence;
        scenario.Page.Dispose();

        await scenario.Page.MoveEntryAsync(occurrence, MonthCell(TheFifteenth));

        Assert.Empty(scenario.Rescheduler.DueMoves);
    }

    [Fact]
    public async Task Moving_nothing_does_nothing()
    {
        using var scenario = await Scenario.CreateAsync(CalendarEntries.Due(TheThirteenth));

        await scenario.Page.MoveEntryAsync(null, MonthCell(TheFifteenth));
        await scenario.Page.MoveEntryByAsync(null, 1, 0);

        Assert.Empty(scenario.Rescheduler.DueMoves);
    }

    [Theory]
    [InlineData(1, "2026-11-14")]
    [InlineData(-1, "2026-11-12")]
    public async Task Day_keys_move_an_all_day_entry_by_one_day(int dayDelta, string expectedDate)
    {
        var entry = CalendarEntries.Due(TheThirteenth);
        using var scenario = await Scenario.CreateAsync(entry);

        await scenario.Page.MoveEntryByAsync(scenario.Occurrence, dayDelta, 0);

        var move = Assert.Single(scenario.Rescheduler.DueMoves);
        Assert.Equal(DateOnly.Parse(expectedDate, CultureInfo.InvariantCulture), move.Date);
        Assert.Null(move.Time);
    }

    [Theory]
    [InlineData(15, "10:15")]
    [InlineData(-15, "09:45")]
    public async Task Minute_keys_move_a_timed_due_entry_by_a_quarter_hour(int minuteDelta, string expectedTime)
    {
        var entry = CalendarEntries.Due(TheThirteenth, time: new TimeOnly(10, 0));
        using var scenario = await Scenario.CreateAsync(entry);

        await scenario.Page.MoveEntryByAsync(scenario.Occurrence, 0, minuteDelta);

        var move = Assert.Single(scenario.Rescheduler.DueMoves);
        Assert.Equal(TheThirteenth, move.Date);
        Assert.Equal(TimeOnly.Parse(expectedTime, CultureInfo.InvariantCulture), move.Time);
    }

    [Fact]
    public async Task Minute_keys_move_a_schedule_and_day_keys_move_it_a_day()
    {
        var entry = CalendarEntries.Scheduled(new DateTime(2026, 11, 13, 9, 0, 0), new DateTime(2026, 11, 13, 10, 0, 0));
        using var scenario = await Scenario.CreateAsync(entry);

        await scenario.Page.MoveEntryByAsync(scenario.Occurrence, 0, 15);
        await scenario.Page.MoveEntryByAsync(scenario.Occurrence, 1, 0);

        Assert.Equal(new DateTime(2026, 11, 13, 9, 15, 0), scenario.Rescheduler.ScheduleMoves[0].Start);
        Assert.Equal(new DateTime(2026, 11, 14, 9, 0, 0), scenario.Rescheduler.ScheduleMoves[1].Start);
    }

    [Fact]
    public async Task Minute_keys_do_nothing_for_an_all_day_entry()
    {
        using var scenario = await Scenario.CreateAsync(CalendarEntries.Due(TheThirteenth));
        var loadsBefore = scenario.Service.Queries.Count;

        await scenario.Page.MoveEntryByAsync(scenario.Occurrence, 0, 15);
        await scenario.Page.MoveEntryByAsync(scenario.Occurrence, 0, -15);

        Assert.Empty(scenario.Rescheduler.DueMoves);
        Assert.Equal(loadsBefore, scenario.Service.Queries.Count);
    }

    [Fact]
    public async Task A_keyboard_move_asks_the_view_to_focus_the_moved_entry_after_the_reload()
    {
        var entry = CalendarEntries.Scheduled(new DateTime(2026, 11, 13, 9, 0, 0), null);
        using var scenario = await Scenario.CreateAsync(entry);
        var requests = new List<CalendarFocusRequest>();
        var loadsWhenRequested = new List<int>();
        scenario.Page.FocusEntryRequested += (_, key) =>
        {
            requests.Add(key);
            loadsWhenRequested.Add(scenario.Service.Queries.Count);
        };
        var loadsBefore = scenario.Service.Queries.Count;

        await scenario.Page.MoveEntryByAsync(scenario.Occurrence, 1, 0);

        var request = Assert.Single(requests);
        Assert.Equal(new CalendarEntryKey(entry.ItemId, CalendarEntryKind.Scheduled), request.Key);
        Assert.Equal(new DateOnly(2026, 11, 14), request.Day);
        Assert.Equal(loadsBefore + 1, Assert.Single(loadsWhenRequested));
    }

    [Fact]
    public async Task A_mouse_drop_does_not_ask_for_focus()
    {
        using var scenario = await Scenario.CreateAsync(CalendarEntries.Due(TheThirteenth));
        var requests = 0;
        scenario.Page.FocusEntryRequested += (_, _) => requests++;

        await scenario.Page.MoveEntryAsync(scenario.Occurrence, MonthCell(TheFifteenth));

        Assert.Equal(0, requests);
    }

    [Fact]
    public async Task A_failed_keyboard_move_does_not_ask_for_focus()
    {
        using var scenario = await Scenario.CreateAsync(CalendarEntries.Due(TheThirteenth));
        scenario.Rescheduler.Failure = new DomainRuleException("Item is missing or deleted.");
        var requests = 0;
        scenario.Page.FocusEntryRequested += (_, _) => requests++;

        await scenario.Page.MoveEntryByAsync(scenario.Occurrence, 1, 0);

        Assert.Equal(0, requests);
    }

    [Fact]
    public async Task Steps_that_arrive_while_a_move_is_saving_are_combined_and_applied_to_the_reloaded_entry()
    {
        var entry = CalendarEntries.Due(TheThirteenth);
        using var scenario = await Scenario.CreateAsync(entry);
        scenario.Rescheduler.Hold = new TaskCompletionSource();
        scenario.FollowMovesInNextLoad(entry);
        var occurrence = scenario.Occurrence;

        var running = scenario.Page.MoveEntryByAsync(occurrence, 1, 0);
        await scenario.Page.MoveEntryByAsync(occurrence, 1, 0);
        await scenario.Page.MoveEntryByAsync(occurrence, 1, 0);
        scenario.Rescheduler.Hold.SetResult();
        await running;

        Assert.Equal(TheThirteenth.AddDays(1), scenario.Rescheduler.DueMoves[0].Date);
        Assert.Equal(TheThirteenth.AddDays(3), scenario.Rescheduler.DueMoves[1].Date);
        Assert.Equal(2, scenario.Rescheduler.DueMoves.Count);
    }

    [Fact]
    public async Task A_drop_that_arrives_while_a_move_is_saving_replaces_the_waiting_one_and_runs_afterwards()
    {
        var entry = CalendarEntries.Due(TheThirteenth);
        using var scenario = await Scenario.CreateAsync(entry);
        scenario.Rescheduler.Hold = new TaskCompletionSource();
        scenario.FollowMovesInNextLoad(entry);
        var occurrence = scenario.Occurrence;

        var running = scenario.Page.MoveEntryAsync(occurrence, MonthCell(TheFifteenth));
        await scenario.Page.MoveEntryAsync(occurrence, MonthCell(TheThirteenth.AddDays(6)));
        scenario.Rescheduler.Hold.SetResult();
        await running;

        Assert.Equal([TheFifteenth, TheThirteenth.AddDays(6)], scenario.Rescheduler.DueMoves.Select(move => move.Date));
    }

    [Fact]
    public async Task A_failed_move_discards_the_moves_waiting_behind_it()
    {
        using var scenario = await Scenario.CreateAsync(CalendarEntries.Due(TheThirteenth));
        scenario.Rescheduler.Hold = new TaskCompletionSource();
        var occurrence = scenario.Occurrence;

        var running = scenario.Page.MoveEntryByAsync(occurrence, 1, 0);
        await scenario.Page.MoveEntryByAsync(occurrence, 1, 0);
        scenario.Rescheduler.Hold.SetException(new DomainRuleException("Item is missing or deleted."));
        await running;

        Assert.Single(scenario.Rescheduler.DueMoves);
        Assert.Equal("Item is missing or deleted.", scenario.Page.Error);
    }

    [Fact]
    public async Task A_move_is_planned_against_the_entry_as_reloaded_since_the_gesture_began()
    {
        var entry = CalendarEntries.Due(TheThirteenth, time: new TimeOnly(10, 0));
        using var scenario = await Scenario.CreateAsync(entry);
        var staleOccurrence = scenario.Occurrence;
        scenario.Service.Entries = [CalendarEntries.Due(TheThirteenth, time: new TimeOnly(11, 0), itemId: entry.ItemId)];
        await scenario.Page.LoadAsync();

        await scenario.Page.MoveEntryAsync(staleOccurrence, MonthCell(TheFifteenth));

        Assert.Equal(new TimeOnly(11, 0), Assert.Single(scenario.Rescheduler.DueMoves).Time);
    }

    [Fact]
    public async Task Disposing_the_page_during_a_save_stops_the_reload_and_the_focus_request()
    {
        var entry = CalendarEntries.Due(TheThirteenth);
        using var scenario = await Scenario.CreateAsync(entry);
        scenario.Rescheduler.Hold = new TaskCompletionSource();
        var requests = 0;
        scenario.Page.FocusEntryRequested += (_, _) => requests++;
        var loadsBefore = scenario.Service.Queries.Count;

        var running = scenario.Page.MoveEntryByAsync(scenario.Occurrence, 1, 0);
        scenario.Page.Dispose();
        scenario.Rescheduler.Hold.SetResult();
        await running;

        Assert.Equal(loadsBefore, scenario.Service.Queries.Count);
        Assert.Equal(0, requests);
        Assert.Null(scenario.Page.Error);
    }

    [Fact]
    public async Task A_move_to_a_day_with_the_entry_unseen_still_reports_that_day_for_focus()
    {
        var entry = CalendarEntries.Due(new DateOnly(2026, 12, 12));
        using var scenario = await Scenario.CreateAsync(entry);
        CalendarFocusRequest? request = null;
        scenario.Page.FocusEntryRequested += (_, focus) => request = focus;
        scenario.Service.Entries = [];

        await scenario.Page.MoveEntryByAsync(scenario.Occurrence, 1, 0);

        Assert.Equal(new DateOnly(2026, 12, 13), request?.Day);
    }

    private static CalendarDropTarget MonthCell(DateOnly day)
    {
        return new CalendarDropTarget(CalendarDropZone.MonthCell, day, null);
    }

    /// <summary>A loaded page showing one entry, with fakes for loading and saving.</summary>
    private sealed class Scenario : IDisposable
    {
        private Scenario(CalendarViewModel page, RecordingCalendarService service,
            RecordingCalendarRescheduler rescheduler)
        {
            Page = page;
            Service = service;
            Rescheduler = rescheduler;
        }

        public CalendarViewModel Page { get; }

        public RecordingCalendarService Service { get; }

        public RecordingCalendarRescheduler Rescheduler { get; }

        public CalendarEntryViewModel Occurrence => FindOccurrence();

        public static async Task<Scenario> CreateAsync(CalendarEntry entry)
        {
            var service = new RecordingCalendarService { Entries = [entry] };
            var rescheduler = new RecordingCalendarRescheduler();
            var clock = new FakeTimeProvider(NoonOnTheThirteenth);
            var page = new CalendarViewModel(service, rescheduler, new FakeNavigationService(), clock,
                TimeZoneInfo.Utc, null, English, new ImmediateDispatcher());
            await page.LoadAsync();
            return new Scenario(page, service, rescheduler);
        }

        /// <summary>Makes the next load show the entry on the date of the latest due move.</summary>
        public void FollowMovesInNextLoad(CalendarEntry original)
        {
            Rescheduler.AfterMove = () => Service.Entries =
            [
                CalendarEntries.Due(Rescheduler.DueMoves[^1].Date, original.Title, itemId: original.ItemId)
            ];
        }

        public CalendarEntryViewModel FindOccurrence()
        {
            return Page.Days.SelectMany(day => day.Entries).First();
        }

        public void Dispose()
        {
            Page.Dispose();
        }
    }
}