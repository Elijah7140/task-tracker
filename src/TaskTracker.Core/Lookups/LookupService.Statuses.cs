using TaskTracker.Core.Undo;

namespace TaskTracker.Core.Lookups;

public sealed partial class LookupService
{
    public async Task<IReadOnlyList<StatusLevel>> StatusesAsync(CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        return await work.Lookups.StatusesAsync(cancellationToken);
    }

    /// <summary>Adds a status at the bottom of the list. Its kind is fixed from now on.</summary>
    public async Task AddStatusAsync(string name, StatusKind kind, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var rows = await work.Lookups.StatusesAsync(cancellationToken);
        var order = rows.Select(status => status.SortOrder).DefaultIfEmpty(-1).Max() + 1;
        var status = StatusLevel.Create(name, kind, order);
        EnsureUniqueName(rows, status, "status");
        work.Lookups.Add(status);
        await work.SaveChangesAsync(UndoLabels.AddStatus(status.Name), cancellationToken);
    }

    public async Task RenameStatusAsync(Guid id, string name, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var rows = await work.Lookups.StatusesAsync(cancellationToken);
        var status = rows.Single(row => row.Id == id);
        status.Rename(name);
        EnsureUniqueName(rows, status, "status");
        await work.SaveChangesAsync(UndoLabels.RenameStatus(status.Name), cancellationToken);
    }

    /// <summary>Archives or restores a status. At least one Done status must stay active.</summary>
    public async Task SetStatusArchivedAsync(Guid id, bool archived, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var rows = await work.Lookups.StatusesAsync(cancellationToken);
        var status = rows.Single(row => row.Id == id);
        if (archived)
        {
            status.Archive();
        }
        else
        {
            status.Unarchive();
        }

        EnsureActiveDoneStatus(rows);
        var label = archived ? UndoLabels.ArchiveStatus(status.Name) : UndoLabels.RestoreStatus(status.Name);
        await work.SaveChangesAsync(label, cancellationToken);
    }

    public async Task ReorderStatusesAsync(IReadOnlyList<Guid> ids, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        Reorder(await work.Lookups.StatusesAsync(cancellationToken), ids);
        await work.SaveChangesAsync(UndoLabels.ReorderStatuses(), cancellationToken);
    }

    private static void EnsureActiveDoneStatus(IEnumerable<StatusLevel> statuses)
    {
        if (!statuses.Any(status => status.Kind == StatusKind.Done && !status.IsArchived))
        {
            throw new DomainRuleException("At least one Done status must stay active.");
        }
    }
}