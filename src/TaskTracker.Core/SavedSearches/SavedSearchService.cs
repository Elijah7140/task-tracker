using TaskTracker.Core.Fields;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Search;
using TaskTracker.Core.Undo;

namespace TaskTracker.Core.SavedSearches;

/// <summary>Lists, saves, renames, deletes and reorders saved searches; one unit of work per operation.</summary>
public sealed class SavedSearchService(IUnitOfWorkFactory factory, TimeProvider clock, FieldWriteGate? writeGate = null)
{
    private readonly FieldWriteGate gate = writeGate ?? FieldWriteGate.Shared;

    /// <summary>All saved searches in display order.</summary>
    public async Task<IReadOnlyList<SavedSearch>> ListAsync(CancellationToken cancellationToken = default)
    {
        await using var unit = factory.Begin();
        return await unit.SavedSearches.ListAsync(cancellationToken);
    }

    /// <summary>Returns one saved search, or null when it was deleted.</summary>
    public async Task<SavedSearch?> FindAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using var unit = factory.Begin();
        return await unit.SavedSearches.FindAsync(id, cancellationToken);
    }

    /// <summary>
    /// Saves a new search. A search with the same name (ignoring case) is replaced only when
    /// <paramref name="overwrite"/> is true; otherwise a rule error explains the clash.
    /// </summary>
    public async Task<SavedSearch> SaveAsync(string name, SavedSearchDefinition definition,
        bool overwrite = false, CancellationToken cancellationToken = default)
    {
        var cleanName = SavedSearch.ValidateName(name);
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unit = factory.Begin();
        await EnsureScopeProjectExistsAsync(unit, definition.Scope, cancellationToken);
        var all = await unit.SavedSearches.ListAsync(cancellationToken);
        var existing = FindByName(all, cleanName, null);

        if (existing is not null)
        {
            return await ReplaceAsync(unit, existing, definition, overwrite, cancellationToken);
        }

        var created = SavedSearch.Create(cleanName, definition, clock, NextSortOrder(all));
        unit.SavedSearches.Add(created);
        await unit.SaveChangesAsync(UndoLabels.SaveSearch(created.Name), cancellationToken);
        return created;
    }

    /// <summary>Renames a saved search; the new name must not belong to another one.</summary>
    public async Task RenameAsync(Guid id, string name, CancellationToken cancellationToken = default)
    {
        var cleanName = SavedSearch.ValidateName(name);
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unit = factory.Begin();
        var search = await RequireAsync(unit, id, cancellationToken);
        var all = await unit.SavedSearches.ListAsync(cancellationToken);
        EnsureNameFree(all, cleanName, id);
        search.Rename(cleanName, clock);
        await unit.SaveChangesAsync(UndoLabels.RenameSearch(search.Name), cancellationToken);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unit = factory.Begin();
        var search = await RequireAsync(unit, id, cancellationToken);
        unit.SavedSearches.Remove(search);
        await unit.SaveChangesAsync(UndoLabels.DeleteSearch(search.Name), cancellationToken);
    }

    /// <summary>
    /// Puts the listed searches first, in the given order; any search not listed keeps its
    /// relative order after them. Unknown or repeated ids are a rule error.
    /// </summary>
    public async Task ReorderAsync(IReadOnlyList<Guid> orderedIds, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unit = factory.Begin();
        var all = await unit.SavedSearches.ListAsync(cancellationToken);
        var sequence = ArrangeByRequestedOrder(all, orderedIds);

        for (var index = 0; index < sequence.Count; index++)
        {
            sequence[index].SetSortOrder(index);
        }

        await unit.SaveChangesAsync(UndoLabels.ReorderSearches(), cancellationToken);
    }

    private async Task<SavedSearch> ReplaceAsync(IUnitOfWork unit, SavedSearch existing,
        SavedSearchDefinition definition, bool overwrite, CancellationToken cancellationToken)
    {
        if (!overwrite)
        {
            throw new DomainRuleException($"A saved search named '{existing.Name}' already exists.");
        }

        existing.Update(definition, clock);
        await unit.SaveChangesAsync(UndoLabels.ReplaceSearch(existing.Name), cancellationToken);
        return existing;
    }

    private static async Task<SavedSearch> RequireAsync(
        IUnitOfWork unit, Guid id, CancellationToken cancellationToken)
    {
        var search = await unit.SavedSearches.FindAsync(id, cancellationToken);

        if (search is null)
        {
            throw new DomainRuleException("This saved search no longer exists.");
        }

        return search;
    }

    private static async Task EnsureScopeProjectExistsAsync(
        IUnitOfWork unit, SearchScope scope, CancellationToken cancellationToken)
    {
        var projectId = scope switch
        {
            SearchScope.Project project => project.ProjectId,
            SearchScope.Area area => area.ProjectId,
            _ => (Guid?)null
        };

        if (projectId is Guid id && await unit.Projects.FindAsync(id, false, cancellationToken) is null)
        {
            throw new DomainRuleException("The project this search is limited to no longer exists.");
        }
    }

    private static SavedSearch? FindByName(IReadOnlyList<SavedSearch> all, string name, Guid? ignoredId)
    {
        return all.FirstOrDefault(search => search.Id != ignoredId
            && string.Equals(search.Name, name, StringComparison.OrdinalIgnoreCase));
    }

    private static void EnsureNameFree(IReadOnlyList<SavedSearch> all, string name, Guid ignoredId)
    {
        var clash = FindByName(all, name, ignoredId);

        if (clash is not null)
        {
            throw new DomainRuleException($"A saved search named '{clash.Name}' already exists.");
        }
    }

    private static int NextSortOrder(IReadOnlyList<SavedSearch> all)
    {
        return all.Count == 0 ? 0 : all.Max(search => search.SortOrder) + 1;
    }

    private static List<SavedSearch> ArrangeByRequestedOrder(
        IReadOnlyList<SavedSearch> all, IReadOnlyList<Guid> orderedIds)
    {
        var byId = all.ToDictionary(search => search.Id);
        var sequence = new List<SavedSearch>();

        foreach (var id in orderedIds)
        {
            if (!byId.Remove(id, out var search))
            {
                throw new DomainRuleException("The new order names a saved search that does not exist or repeats one.");
            }

            sequence.Add(search);
        }

        sequence.AddRange(all.Where(search => byId.ContainsKey(search.Id)));
        return sequence;
    }
}