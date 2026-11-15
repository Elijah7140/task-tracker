using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;

namespace TaskTracker.Core.Tests.SavedSearches;

public sealed class SavedSearchTests
{
    private static readonly FakeTimeProvider Clock = new(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));

    [Fact]
    public void Name_is_trimmed_and_must_not_be_blank_or_too_long()
    {
        var search = SavedSearch.Create("  Overdue  ", Definition(new SearchScope.AllProjects()), Clock, 0);

        Assert.Equal("Overdue", search.Name);
        Assert.Throws<DomainRuleException>(() => SavedSearch.ValidateName("   "));
        Assert.Throws<DomainRuleException>(() => SavedSearch.ValidateName(new string('x', 301)));
    }

    [Fact]
    public void An_all_projects_scope_round_trips()
    {
        var search = SavedSearch.Create("a", Definition(new SearchScope.AllProjects()), Clock, 0);

        Assert.Equal(SavedSearchScopeKind.AllProjects, search.ScopeKind);
        Assert.IsType<SearchScope.AllProjects>(search.ToScope());
    }

    [Fact]
    public void A_project_scope_round_trips()
    {
        var projectId = Guid.NewGuid();
        var search = SavedSearch.Create("a", Definition(new SearchScope.Project(projectId)), Clock, 0);

        Assert.Equal(SavedSearchScopeKind.Project, search.ScopeKind);
        Assert.Equal(new SearchScope.Project(projectId), search.ToScope());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void A_folder_scope_keeps_the_folder_and_the_subfolder_switch(bool includeSubfolders)
    {
        var scope = new SearchScope.Area(Guid.NewGuid(), Guid.NewGuid(), includeSubfolders);
        var search = SavedSearch.Create("a", Definition(scope), Clock, 0);

        Assert.Equal(SavedSearchScopeKind.Folder, search.ScopeKind);
        Assert.Equal(scope, search.ToScope());
    }

    [Fact]
    public void Updating_replaces_query_scope_and_completed_switch_and_touches_the_time()
    {
        var clock = new FakeTimeProvider(Clock.GetUtcNow());
        var search = SavedSearch.Create("a", Definition(new SearchScope.Project(Guid.NewGuid())), clock, 3);
        clock.Advance(TimeSpan.FromHours(1));

        search.Update(new SavedSearchDefinition("is:done", new SearchScope.AllProjects(), true), clock);

        Assert.Equal("is:done", search.QueryText);
        Assert.True(search.IncludeCompleted);
        Assert.Null(search.ProjectId);
        Assert.Equal(3, search.SortOrder);
        Assert.Equal(search.CreatedAtUtc.AddHours(1), search.UpdatedAtUtc);
    }

    [Fact]
    public void An_overlong_query_is_a_rule_error()
    {
        var definition = new SavedSearchDefinition(
            new string('x', SavedSearch.QueryTextMaxLength + 1), new SearchScope.AllProjects(), false);

        Assert.Throws<DomainRuleException>(() => SavedSearch.Create("a", definition, Clock, 0));
    }

    private static SavedSearchDefinition Definition(SearchScope scope)
    {
        return new SavedSearchDefinition("due<today", scope, false);
    }
}