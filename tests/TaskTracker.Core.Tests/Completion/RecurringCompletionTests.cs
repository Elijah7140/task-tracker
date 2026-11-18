using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Completion;
using TaskTracker.Core.Items;
using TaskTracker.Core.Items.Recurrence;
using TaskTracker.Core.Lookups;

namespace TaskTracker.Core.Tests.Completion;

/// <summary>Recurrence side effects during bottom-up completion.</summary>
public sealed class RecurringCompletionTests
{
    private readonly FakeTimeProvider clock = new(new DateTimeOffset(2026, 11, 13, 1, 0, 0, TimeSpan.Zero));

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void An_open_repeat_of_the_child_keeps_the_parent_open(bool completeParent)
    {
        var (tree, parent, child) = CreateTree();
        Repeat(child);
        var completion = new RecurringCompletion(tree, clock, TimeZoneInfo.Utc, BuiltInLookups.CompletedId);

        completion.Complete(completeParent ? parent.Id : child.Id, autoComplete: true, confirmed: true);

        Assert.Null(parent.CompletedAtUtc);
        Assert.NotNull(child.CompletedAtUtc);
        var next = Assert.Single(tree.Children(parent.Id), item => item.Id != child.Id);
        Assert.Null(next.CompletedAtUtc);
        Assert.Equal(child.DueDate!.Value.AddDays(1), next.DueDate);
    }

    [Fact]
    public void Auto_completing_a_repeating_parent_creates_an_open_copy_and_child()
    {
        var (tree, parent, child) = CreateTree();
        Repeat(parent);
        var completion = new RecurringCompletion(tree, clock, TimeZoneInfo.Utc, BuiltInLookups.CompletedId);

        completion.Complete(child.Id, autoComplete: true, confirmed: false);

        Assert.NotNull(parent.CompletedAtUtc);
        var next = Assert.Single(tree.Children(null), item => item.Id != parent.Id);
        Assert.Null(next.CompletedAtUtc);
        Assert.Null(Assert.Single(tree.Children(next.Id)).CompletedAtUtc);
        Assert.Equal(parent.RecurrenceSeriesId, next.RecurrenceSeriesId);
    }

    [Fact]
    public void Independent_parent_completion_copies_the_subtree_and_uses_the_local_completion_day()
    {
        var (tree, parent, child) = CreateTree();
        Repeat(parent, RecurrenceAnchor.CompletionDate);
        var zone = TimeZoneInfo.CreateCustomTimeZone("UTC-04", TimeSpan.FromHours(-4), "UTC-04", "UTC-04");
        var completion = new RecurringCompletion(tree, clock, zone, BuiltInLookups.CompletedId);

        completion.Complete(parent.Id, autoComplete: false, confirmed: false);

        Assert.Null(child.CompletedAtUtc);
        var next = Assert.Single(tree.Children(null), item => item.Id != parent.Id);
        Assert.Equal(new DateOnly(2026, 11, 13), next.DueDate);
        Assert.Null(Assert.Single(tree.Children(next.Id)).CompletedAtUtc);
    }

    private (ItemTree Tree, TodoItem Parent, TodoItem Child) CreateTree()
    {
        var projectId = Guid.CreateVersion7();
        var parent = TodoItem.Create(projectId, null, null, "Parent", clock);
        var child = TodoItem.Create(projectId, null, parent.Id, "Child", clock);
        return (new ItemTree(projectId, null, [parent, child]), parent, child);
    }

    private void Repeat(TodoItem item, RecurrenceAnchor anchor = RecurrenceAnchor.DueDate)
    {
        item.SetDue(new DateOnly(2026, 11, 13), null, clock);
        item.SetRecurrence(new RecurrenceRule(RecurrenceFrequency.Daily, Anchor: anchor), clock);
    }
}