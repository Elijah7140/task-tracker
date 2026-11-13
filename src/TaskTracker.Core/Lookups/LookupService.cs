using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Lookups;

/// <summary>Manages editable lookup lists.</summary>
public sealed class LookupService(IUnitOfWorkFactory unitOfWorkFactory)
{
    public async Task<IReadOnlyList<ItemType>> ItemTypesAsync(CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        return await repository.ItemTypesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<PriorityLevel>> PriorityLevelsAsync(CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        return await repository.PriorityLevelsAsync(cancellationToken);
    }

    public async Task<ItemType> AddItemTypeAsync(string name, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.ItemTypesAsync(cancellationToken);
        var itemType = ItemType.Create(name, rows.Count);
        EnsureUniqueName(rows, itemType, "item type");
        repository.Add(itemType);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return itemType;
    }

    public async Task<PriorityLevel> AddPriorityLevelAsync(string name, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.PriorityLevelsAsync(cancellationToken);
        var level = PriorityLevel.Create(name, rows.Count);
        EnsureUniqueName(rows, level, "priority level");
        repository.Add(level);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return level;
    }

    public async Task RenameItemTypeAsync(Guid id, string name, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.ItemTypesAsync(cancellationToken);
        var row = rows.Single(entry => entry.Id == id);
        row.Rename(name);
        EnsureUniqueName(rows, row, "item type");
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task RenamePriorityLevelAsync(Guid id, string name, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.PriorityLevelsAsync(cancellationToken);
        var row = rows.Single(entry => entry.Id == id);
        row.Rename(name);
        EnsureUniqueName(rows, row, "priority level");
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task ArchiveItemTypeAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.ItemTypesAsync(cancellationToken);
        rows.Single(row => row.Id == id).Archive();
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task ArchivePriorityLevelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.PriorityLevelsAsync(cancellationToken);
        rows.Single(row => row.Id == id).Archive();
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task UnarchiveItemTypeAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var rows = await unitOfWork.Lookups.ItemTypesAsync(cancellationToken);
        rows.Single(row => row.Id == id).Unarchive();
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task UnarchivePriorityLevelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var rows = await unitOfWork.Lookups.PriorityLevelsAsync(cancellationToken);
        rows.Single(row => row.Id == id).Unarchive();
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task ReorderItemTypesAsync(IReadOnlyList<Guid> ids, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.ItemTypesAsync(cancellationToken);
        Reorder(rows, ids);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task ReorderPriorityLevelsAsync(IReadOnlyList<Guid> ids, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.PriorityLevelsAsync(cancellationToken);
        Reorder(rows, ids);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static void EnsureUniqueName(IEnumerable<LookupEntity> rows, LookupEntity candidate, string kind)
    {
        var duplicate = rows.Any(row => row.Id != candidate.Id &&
            string.Equals(row.Name, candidate.Name, StringComparison.OrdinalIgnoreCase));

        if (duplicate)
        {
            throw new DomainRuleException($"The name '{candidate.Name}' is already used by another {kind}.");
        }
    }

    private static void Reorder<T>(IReadOnlyList<T> rows, IReadOnlyList<Guid> ids) where T : LookupEntity
    {
        if (rows.Count != ids.Count || ids.ToHashSet().Count != rows.Count || rows.Any(row => !ids.Contains(row.Id)))
        {
            throw new DomainRuleException("Order must contain every lookup exactly once.");
        }

        for (var index = 0; index < ids.Count; index++)
        {
            rows.Single(row => row.Id == ids[index]).Reorder(index);
        }
    }
}