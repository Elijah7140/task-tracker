using TaskTracker.Core.Lookups;

namespace TaskTracker.Core.Tests.Lookups;

public sealed class LookupEntityTests
{
    [Fact]
    public void Seeded_priority_can_be_archived_but_seeded_type_cannot()
    {
        var priority = BuiltInLookups.PriorityLevels[0];
        var itemType = BuiltInLookups.ItemTypes[0];

        priority.Archive();

        Assert.True(priority.IsArchived);
        Assert.Throws<TaskTracker.Core.DomainRuleException>(() => itemType.Archive());
    }
}