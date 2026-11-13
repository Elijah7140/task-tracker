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
        repository.Add(level);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return level;
    }

    public async Task RenameItemTypeAsync(Guid id, string name, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.ItemTypesAsync(cancellationToken);
        rows.Single(row => row.Id == id).Rename(name);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task RenamePriorityLevelAsync(Guid id, string name, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.PriorityLevelsAsync(cancellationToken);
        rows.Single(row => row.Id == id).Rename(name);
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

    private static void Reorder<T>(IReadOnlyList<T> rows, IReadOnlyList<Guid> ids) where T : LookupEntity
    {
        if (rows.Count != ids.Count || ids.ToHashSet().Count != rows.Count || rows.Any(row => !ids.Contains(row.Id)))
        {
            throw new InvalidOperationException("Order must contain every lookup exactly once.");
        }

        for (var index = 0; index < ids.Count; index++)
        {
            rows.Single(row => row.Id == ids[index]).Reorder(index);
        }
    }
}