using TaskTracker.Core.Fields;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Undo;

namespace TaskTracker.Core.Lookups;

/// <summary>Manages editable lookup lists.</summary>
public sealed partial class LookupService(IUnitOfWorkFactory unitOfWorkFactory, FieldWriteGate? writeGate = null)
{
    private readonly FieldWriteGate gate = writeGate ?? FieldWriteGate.Shared;

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
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.ItemTypesAsync(cancellationToken);
        var itemType = ItemType.Create(name, rows.Count);
        EnsureUniqueName(rows, itemType, "item type");
        repository.Add(itemType);
        await unitOfWork.SaveChangesAsync(UndoLabels.AddItemType(itemType.Name), cancellationToken);
        return itemType;
    }

    public Task<PriorityLevel> AddPriorityLevelAsync(string name, CancellationToken cancellationToken = default)
    {
        return AddPriorityLevelAsync(name, null, cancellationToken);
    }

    /// <summary>Adds a priority level at the bottom of the list; one with a number may have an empty name.</summary>
    public async Task<PriorityLevel> AddPriorityLevelAsync(string name, int? number, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.PriorityLevelsAsync(cancellationToken);
        var level = PriorityLevel.Create(name, rows.Count, number);
        EnsureUniqueNumber(rows, level);
        EnsureUniqueName(rows, level, "priority level");
        repository.Add(level);
        await unitOfWork.SaveChangesAsync(UndoLabels.AddPriority(level.Label), cancellationToken);
        return level;
    }

    public async Task RenameItemTypeAsync(Guid id, string name, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.ItemTypesAsync(cancellationToken);
        var row = rows.Single(entry => entry.Id == id);
        row.Rename(name);
        EnsureUniqueName(rows, row, "item type");
        await unitOfWork.SaveChangesAsync(UndoLabels.RenameItemType(row.Name), cancellationToken);
    }

    public async Task RenamePriorityLevelAsync(Guid id, string name, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.PriorityLevelsAsync(cancellationToken);
        var row = rows.Single(entry => entry.Id == id);
        row.Rename(name);
        EnsureUniqueName(rows, row, "priority level");
        await unitOfWork.SaveChangesAsync(UndoLabels.RenamePriority(row.Label), cancellationToken);
    }

    public async Task ArchiveItemTypeAsync(Guid id, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.ItemTypesAsync(cancellationToken);
        var entry = rows.Single(row => row.Id == id);
        entry.Archive();
        await unitOfWork.SaveChangesAsync(UndoLabels.ArchiveItemType(entry.Name), cancellationToken);
    }

    public async Task ArchivePriorityLevelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.PriorityLevelsAsync(cancellationToken);
        var entry = rows.Single(row => row.Id == id);
        entry.Archive();
        await unitOfWork.SaveChangesAsync(UndoLabels.ArchivePriority(entry.Label), cancellationToken);
    }

    public async Task UnarchiveItemTypeAsync(Guid id, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var rows = await unitOfWork.Lookups.ItemTypesAsync(cancellationToken);
        var entry = rows.Single(row => row.Id == id);
        entry.Unarchive();
        await unitOfWork.SaveChangesAsync(UndoLabels.RestoreItemType(entry.Name), cancellationToken);
    }

    public async Task UnarchivePriorityLevelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var rows = await unitOfWork.Lookups.PriorityLevelsAsync(cancellationToken);
        var level = rows.Single(row => row.Id == id);
        level.Unarchive();
        EnsureUniqueNumber(rows, level);
        await unitOfWork.SaveChangesAsync(UndoLabels.RestorePriority(level.Label), cancellationToken);
    }

    public async Task ReorderItemTypesAsync(IReadOnlyList<Guid> ids, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.ItemTypesAsync(cancellationToken);
        Reorder(rows, ids);
        await unitOfWork.SaveChangesAsync(UndoLabels.ReorderItemTypes(), cancellationToken);
    }

    public async Task ReorderPriorityLevelsAsync(IReadOnlyList<Guid> ids, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var repository = unitOfWork.Lookups;
        var rows = await repository.PriorityLevelsAsync(cancellationToken);
        Reorder(rows, ids);
        await unitOfWork.SaveChangesAsync(UndoLabels.ReorderPriorities(), cancellationToken);
    }

    /// <summary>Sets or clears a level's number label. The number never affects rank (§7.15).</summary>
    public async Task SetPriorityNumberAsync(Guid id, int? number, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var rows = await work.Lookups.PriorityLevelsAsync(cancellationToken);
        var level = rows.Single(row => row.Id == id);
        level.SetLabel(level.Name, number);
        EnsureUniqueNumber(rows, level);
        await work.SaveChangesAsync(UndoLabels.SetPriorityNumber(level.Label), cancellationToken);
    }

    private static void EnsureUniqueNumber(IEnumerable<PriorityLevel> rows, PriorityLevel level)
    {
        if (!level.IsArchived && level.Number.HasValue &&
            rows.Any(other => other.Id != level.Id && !other.IsArchived && other.Number == level.Number))
        {
            throw new DomainRuleException($"Priority number {level.Number} is already in use.");
        }
    }

    /// <summary>
    /// Rejects a name already used by another entry of the list, ignoring case. Archived entries keep
    /// their names reserved, so restoring one never collides (§5).
    /// </summary>
    private static void EnsureUniqueName(IEnumerable<LookupEntity> rows, LookupEntity candidate, string kind)
    {
        if (candidate.Name.Length == 0)
        {
            return;
        }

        var duplicate = rows.FirstOrDefault(row => row.Id != candidate.Id &&
            LookupEntity.NameComparer.Equals(row.Name, candidate.Name));

        if (duplicate is { IsArchived: true })
        {
            var isRenaming = rows.Any(row => row.Id == candidate.Id);
            throw new DomainRuleException(ArchivedNameMessage(candidate.Name, kind, isRenaming));
        }

        if (duplicate is not null)
        {
            throw new DomainRuleException($"The name '{candidate.Name}' is already used by another {kind}.");
        }
    }

    /// <summary>A new entry can be replaced by restoring the archived one; a renamed entry cannot.</summary>
    private static string ArchivedNameMessage(string name, string kind, bool isRenaming)
    {
        var usedBy = $"The name '{name}' is used by an archived {kind}.";

        return isRenaming
            ? $"{usedBy} Restore or rename that one first."
            : $"{usedBy} Restore it instead.";
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