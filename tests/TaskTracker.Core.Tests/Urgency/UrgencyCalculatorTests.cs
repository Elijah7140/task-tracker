using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Urgency;

using UrgencyLevel = TaskTracker.Core.Urgency.Urgency;

namespace TaskTracker.Core.Tests.Urgency;

public sealed class UrgencyCalculatorTests
{
    private readonly FakeTimeProvider clock = new(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));

    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    private TodoItem Item(Guid projectId, Guid? parentId = null)
    {
        return TodoItem.Create(projectId, null, parentId, "Task", clock);
    }

    private void Schedule(TodoItem item, TimeSpan offset)
    {
        item.SetSchedule(DateTime.SpecifyKind(Now.Add(offset), DateTimeKind.Unspecified), null, clock);
    }

    [Fact]
    public void Exact_threshold_and_deadline_boundaries_have_expected_urgency()
    {
        var item = Item(Guid.NewGuid());
        var thresholds = new UrgencyThresholds(TimeSpan.FromDays(3), TimeSpan.FromDays(1));

        Schedule(item, TimeSpan.FromDays(3));
        var yellow = UrgencyCalculator.Calculate(item, Now, TimeZoneInfo.Utc, thresholds);
        Schedule(item, TimeSpan.FromDays(1));
        var red = UrgencyCalculator.Calculate(item, Now, TimeZoneInfo.Utc, thresholds);
        Schedule(item, TimeSpan.Zero);
        var atDeadline = UrgencyCalculator.Calculate(item, Now, TimeZoneInfo.Utc, thresholds);
        Schedule(item, TimeSpan.FromTicks(-1));
        var overdue = UrgencyCalculator.Calculate(item, Now, TimeZoneInfo.Utc, thresholds);

        Assert.Equal(UrgencyLevel.Approaching, yellow);
        Assert.Equal(UrgencyLevel.Imminent, red);
        Assert.Equal(UrgencyLevel.Imminent, atDeadline);
        Assert.Equal(UrgencyLevel.Overdue, overdue);
    }

    [Fact]
    public void Completed_item_has_no_urgency_even_with_overdue_deadline()
    {
        var item = Item(Guid.NewGuid());
        Schedule(item, TimeSpan.FromDays(-1));
        item.SetCompletion(Now, clock);

        var actual = UrgencyCalculator.Calculate(item, Now, TimeZoneInfo.Utc, new UrgencyThresholds(TimeSpan.FromDays(3), TimeSpan.FromDays(1)));

        Assert.Equal(UrgencyLevel.None, actual);
    }

    [Fact]
    public void Due_date_takes_precedence_over_scheduled_start()
    {
        var item = Item(Guid.NewGuid());
        Schedule(item, TimeSpan.FromHours(-1));
        item.SetDue(DateOnly.FromDateTime(Now.AddDays(10)), null, clock);

        var actual = UrgencyCalculator.Calculate(item, Now, TimeZoneInfo.Utc, new UrgencyThresholds(TimeSpan.FromDays(3), TimeSpan.FromDays(1)));

        Assert.Equal(UrgencyLevel.None, actual);
    }

    [Fact]
    public void Date_only_due_is_later_than_timed_due_on_the_same_day()
    {
        var dateOnly = Item(Guid.NewGuid());
        var timed = Item(Guid.NewGuid());
        var today = DateOnly.FromDateTime(Now);
        dateOnly.SetDue(today, null, clock);
        timed.SetDue(today, new TimeOnly(11, 0), clock);
        var thresholds = new UrgencyThresholds(TimeSpan.FromDays(3), TimeSpan.FromDays(1));

        var dateOnlyUrgency = UrgencyCalculator.Calculate(dateOnly, Now, TimeZoneInfo.Utc, thresholds);
        var timedUrgency = UrgencyCalculator.Calculate(timed, Now, TimeZoneInfo.Utc, thresholds);

        Assert.Equal(UrgencyLevel.Imminent, dateOnlyUrgency);
        Assert.Equal(UrgencyLevel.Overdue, timedUrgency);
    }

    [Fact]
    public void Most_urgent_open_branch_is_attributed_to_its_item()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var yellow = Item(projectId, root.Id);
        var red = Item(projectId, root.Id);
        Schedule(root, TimeSpan.FromDays(2));
        Schedule(yellow, TimeSpan.FromDays(2));
        Schedule(red, TimeSpan.FromHours(2));
        var tree = new ItemTree(projectId, null, [root, yellow, red]);

        var actual = UrgencyCalculator.CalculateDisplayed(tree, root.Id, Now, TimeZoneInfo.Utc, new UrgencyThresholds(TimeSpan.FromDays(3), TimeSpan.FromDays(1)));

        Assert.Equal(UrgencyLevel.Imminent, actual.Value);
        Assert.Equal(red.Id, actual.SourceDescendantId);
    }

    [Fact]
    public void Parent_own_urgency_wins_ties()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var child = Item(projectId, root.Id);
        Schedule(root, TimeSpan.FromHours(2));
        Schedule(child, TimeSpan.FromHours(1));
        var tree = new ItemTree(projectId, null, [root, child]);

        var actual = UrgencyCalculator.CalculateDisplayed(tree, root.Id, Now, TimeZoneInfo.Utc, new UrgencyThresholds(TimeSpan.FromDays(3), TimeSpan.FromDays(1)));

        Assert.Equal(UrgencyLevel.Imminent, actual.Value);
        Assert.Null(actual.SourceDescendantId);
    }

    [Fact]
    public void Open_descendant_of_completed_parent_still_contributes()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var child = Item(projectId, root.Id);
        root.SetCompletion(Now, clock);
        Schedule(child, TimeSpan.FromHours(2));
        var tree = new ItemTree(projectId, null, [root, child]);

        var actual = UrgencyCalculator.CalculateDisplayed(tree, root.Id, Now, TimeZoneInfo.Utc, new UrgencyThresholds(TimeSpan.FromDays(3), TimeSpan.FromDays(1)));

        Assert.Equal(UrgencyLevel.Imminent, actual.Value);
        Assert.Equal(child.Id, actual.SourceDescendantId);
    }

    [Fact]
    public void Deleted_descendants_do_not_contribute()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var child = Item(projectId, root.Id);
        Schedule(child, TimeSpan.FromHours(-1));
        child.Delete(Guid.NewGuid(), clock);
        var tree = new ItemTree(projectId, null, [root, child]);

        var actual = UrgencyCalculator.CalculateDisplayed(tree, root.Id, Now, TimeZoneInfo.Utc, new UrgencyThresholds(TimeSpan.FromDays(3), TimeSpan.FromDays(1)));

        Assert.Equal(UrgencyLevel.None, actual.Value);
    }

    [Fact]
    public void Yellow_band_clamps_to_red_when_red_is_larger()
    {
        var thresholds = new UrgencyThresholds(TimeSpan.FromHours(1), TimeSpan.FromDays(1));
        var item = Item(Guid.NewGuid());
        Schedule(item, TimeSpan.FromHours(20));

        var actual = UrgencyCalculator.Calculate(item, Now, TimeZoneInfo.Utc, thresholds);

        Assert.Equal(TimeSpan.FromDays(1), thresholds.Yellow);
        Assert.Equal(UrgencyLevel.Imminent, actual);
    }

    [Fact]
    public void Loaded_node_rolls_up_urgency_and_names_its_descendant()
    {
        var projectId = Guid.NewGuid();
        var parent = Item(projectId);
        var child = Item(projectId, parent.Id);
        Schedule(child, TimeSpan.FromHours(-1));
        var childNode = new ItemNode(child, UrgencyLevel.None,
            new DisplayedUrgency(UrgencyLevel.None, null), false, []);
        var parentNode = new ItemNode(parent, UrgencyLevel.None,
            new DisplayedUrgency(UrgencyLevel.None, null), false, [childNode]);

        var actual = UrgencyCalculator.CalculateDisplayed(parentNode, Now, TimeZoneInfo.Utc,
            new UrgencyThresholds(TimeSpan.FromDays(3), TimeSpan.FromDays(1)));

        Assert.Equal(UrgencyLevel.Overdue, actual.Value);
        Assert.Equal(child.Id, actual.SourceDescendantId);
    }

    [Theory]
    [InlineData(-1, UrgencyLevel.Overdue)]
    [InlineData(0, UrgencyLevel.Imminent)]
    [InlineData(24, UrgencyLevel.Imminent)]
    [InlineData(25, UrgencyLevel.Approaching)]
    [InlineData(72, UrgencyLevel.Approaching)]
    [InlineData(73, UrgencyLevel.None)]
    public void Deadline_overload_classifies_hours_remaining(int hoursRemaining, UrgencyLevel expected)
    {
        var thresholds = new UrgencyThresholds(TimeSpan.FromDays(3), TimeSpan.FromHours(24));
        var deadline = Now.AddHours(hoursRemaining);

        var actual = UrgencyCalculator.Calculate(deadline, Now, thresholds);

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Deadline_overload_without_a_deadline_has_no_urgency()
    {
        var thresholds = new UrgencyThresholds(TimeSpan.FromDays(3), TimeSpan.FromHours(24));

        var actual = UrgencyCalculator.Calculate((DateTime?)null, Now, thresholds);

        Assert.Equal(UrgencyLevel.None, actual);
    }

    [Fact]
    public void Deadline_overload_clamps_yellow_through_the_thresholds()
    {
        var thresholds = new UrgencyThresholds(TimeSpan.FromHours(1), TimeSpan.FromHours(24));

        var actual = UrgencyCalculator.Calculate(Now.AddHours(20), Now, thresholds);

        Assert.Equal(UrgencyLevel.Imminent, actual);
    }

    [Fact]
    public void Effective_deadline_prefers_due_date_and_treats_a_missing_time_as_end_of_day()
    {
        var due = new DateOnly(2026, 11, 14);
        var scheduled = new DateTime(2026, 11, 13, 9, 0, 0);

        var dateOnly = UrgencyCalculator.EffectiveDeadline(due, null, scheduled, TimeZoneInfo.Utc);
        var timed = UrgencyCalculator.EffectiveDeadline(due, new TimeOnly(8, 30), scheduled, TimeZoneInfo.Utc);

        Assert.Equal(due.ToDateTime(TimeOnly.MaxValue), dateOnly);
        Assert.Equal(new DateTime(2026, 11, 14, 8, 30, 0), timed);
    }

    [Fact]
    public void Effective_deadline_falls_back_to_the_scheduled_start_then_to_none()
    {
        var scheduled = new DateTime(2026, 11, 13, 9, 0, 0);

        var fromSchedule = UrgencyCalculator.EffectiveDeadline(null, null, scheduled, TimeZoneInfo.Utc);
        var none = UrgencyCalculator.EffectiveDeadline(null, null, null, TimeZoneInfo.Utc);

        Assert.Equal(scheduled, fromSchedule);
        Assert.Null(none);
    }
}