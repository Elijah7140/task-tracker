using TaskTracker.Core.Lookups;

namespace TaskTracker.Core.Tests.Lookups;

public sealed class PriorityLevelTests
{
    [Fact]
    public void Label_shows_the_number_the_name_or_both()
    {
        var numberOnly = PriorityLevel.Create(string.Empty, number: 7);
        var both = PriorityLevel.Create("Hotfix", number: 7);
        var nameOnly = PriorityLevel.Create("Hotfix");

        Assert.Equal("7", numberOnly.Label);
        Assert.Equal("7 · Hotfix", both.Label);
        Assert.Equal("Hotfix", nameOnly.Label);
    }

    [Fact]
    public void Number_must_be_at_least_one()
    {
        var level = PriorityLevel.Create("High");

        var error = Assert.Throws<DomainRuleException>(() => level.SetLabel("High", 0));

        Assert.Equal("Priority number must be at least 1.", error.Message);
        Assert.Null(level.Number);
    }

    [Fact]
    public void Clearing_the_number_of_a_number_only_level_requires_a_name()
    {
        var level = PriorityLevel.Create(string.Empty, number: 3);

        Assert.Throws<DomainRuleException>(() => level.SetLabel(string.Empty, null));

        Assert.Equal(3, level.Number);
    }

    [Fact]
    public void Renaming_keeps_the_number()
    {
        var level = PriorityLevel.Create("High", number: 7);

        level.Rename("Hotfix");

        Assert.Equal("7 · Hotfix", level.Label);
    }
}