using TaskTracker.Core.Search;

namespace TaskTracker.Core.SavedSearches;

/// <summary>A named query the user can run again.</summary>
public sealed class SavedSearch
{
    public const int NameMaxLength = 300;
    public const int QueryTextMaxLength = 4000;

    private SavedSearch()
    {
    }

    public Guid Id { get; private set; }

    /// <summary>The display name, unique among saved searches ignoring case.</summary>
    public string Name { get; private set; } = string.Empty;

    /// <summary>The query in stable form, so renamed choices never break it.</summary>
    public string QueryText { get; private set; } = string.Empty;

    public SavedSearchScopeKind ScopeKind { get; private set; }

    public Guid? ProjectId { get; private set; }

    public Guid? FolderId { get; private set; }

    public bool IncludeSubfolders { get; private set; } = true;

    public bool IncludeCompleted { get; private set; }

    public int SortOrder { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public static SavedSearch Create(
        string name, SavedSearchDefinition definition, TimeProvider clock, int sortOrder)
    {
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var search = new SavedSearch
        {
            Id = Guid.CreateVersion7(),
            Name = ValidateName(name),
            SortOrder = sortOrder,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc
        };

        search.ApplyDefinition(definition);
        return search;
    }

    /// <summary>Trims and checks a saved search name.</summary>
    public static string ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > NameMaxLength)
        {
            throw new DomainRuleException($"Name must be 1 to {NameMaxLength} characters.");
        }

        return name.Trim();
    }

    public void Rename(string name, TimeProvider clock)
    {
        Name = ValidateName(name);
        Touch(clock);
    }

    /// <summary>Replaces the stored query, scope and include-completed switch.</summary>
    public void Update(SavedSearchDefinition definition, TimeProvider clock)
    {
        ApplyDefinition(definition);
        Touch(clock);
    }

    public void SetSortOrder(int order)
    {
        SortOrder = order;
    }

    /// <summary>The search scope this saved search runs in.</summary>
    public SearchScope ToScope()
    {
        return (ScopeKind, ProjectId) switch
        {
            (SavedSearchScopeKind.Project, Guid projectId) => new SearchScope.Project(projectId),
            (SavedSearchScopeKind.Folder, Guid projectId) => new SearchScope.Area(projectId, FolderId, IncludeSubfolders),
            _ => new SearchScope.AllProjects()
        };
    }

    /// <summary>The stored definition, as the service saves and the search page applies it.</summary>
    public SavedSearchDefinition ToDefinition()
    {
        return new SavedSearchDefinition(QueryText, ToScope(), IncludeCompleted);
    }

    private void ApplyDefinition(SavedSearchDefinition definition)
    {
        if (definition.QueryText.Length > QueryTextMaxLength)
        {
            throw new DomainRuleException($"A saved search can hold at most {QueryTextMaxLength} characters of query.");
        }

        QueryText = definition.QueryText;
        IncludeCompleted = definition.IncludeCompleted;
        ApplyScope(definition.Scope);
    }

    private void ApplyScope(SearchScope scope)
    {
        ScopeKind = SavedSearchScopeKind.AllProjects;
        ProjectId = null;
        FolderId = null;
        IncludeSubfolders = true;

        if (scope is SearchScope.Project project)
        {
            ScopeKind = SavedSearchScopeKind.Project;
            ProjectId = project.ProjectId;
        }

        if (scope is SearchScope.Area area)
        {
            ScopeKind = SavedSearchScopeKind.Folder;
            ProjectId = area.ProjectId;
            FolderId = area.FolderId;
            IncludeSubfolders = area.IncludeSubfolders;
        }
    }

    private void Touch(TimeProvider clock)
    {
        UpdatedAtUtc = clock.GetUtcNow().UtcDateTime;
    }
}