using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;

namespace TaskTracker.Core.Tests.Items;

public sealed class TodoItemStatusTests
{
    [Fact]
    public void Completion_remembers_the_open_status_and_reopen_restores_it()
    {
        var clock = new FakeTimeProvider();
        var item = TodoItem.Create(Guid.CreateVersion7(), null, null, "Item", clock);
        var testing = StatusLevel.Create("Testing", StatusKind.Open);
        item.SetOpenStatus(testing, clock);

        item.SetCompletion(clock.GetUtcNow().UtcDateTime, clock);

        Assert.Equal(BuiltInLookups.CompletedId, item.StatusId);
        Assert.Equal(testing.Id, item.ReopenStatusId);

        item.SetCompletion(null, clock);

        Assert.Equal(testing.Id, item.StatusId);
        Assert.Null(item.ReopenStatusId);
        Assert.Null(item.CompletedAtUtc);
    }
}