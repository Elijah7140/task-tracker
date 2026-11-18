using System.Linq.Expressions;

using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Checks the ancestors of every row that replay returns to the active tree.</summary>
internal static class UndoHierarchyGuard
{
    public static async Task VerifyAsync(TaskTrackerDbContext database, IReadOnlyList<UndoRowSnapshot> rows,
        bool forward, CancellationToken cancellationToken)
    {
        var activations = rows.Where(row => Activates(row, forward)).ToArray();
        if (activations.Length == 0)
        {
            return;
        }

        var proposed = rows.Where(row => row.EntityType == typeof(Project) || row.EntityType == typeof(Folder)
                || row.EntityType == typeof(TodoItem))
            .ToDictionary(row => (row.EntityType, row.Key[0]), row => row.Target(forward));
        var checkedFolders = new HashSet<Guid>();
        var checkedItems = new HashSet<Guid>();
        var checkedProjects = new HashSet<Guid>();

        foreach (var row in activations)
        {
            var target = row.Target(forward)!;
            if (row.EntityType == typeof(TodoItem))
            {
                await VerifyChainAsync(database.TodoItems, proposed, checkedItems,
                    (Guid?)target[nameof(TodoItem.ParentItemId)], nameof(TodoItem.ParentItemId), nameof(TodoItem.Title),
                    item => new Ancestor(item.Title, item.ParentItemId, item.DeletedAtUtc), "item", cancellationToken);
            }

            await VerifyChainAsync(database.Folders, proposed, checkedFolders, FolderId(row, target),
                nameof(Folder.ParentFolderId), nameof(Folder.Name),
                folder => new Ancestor(folder.Name, folder.ParentFolderId, folder.DeletedAtUtc), "folder", cancellationToken);
            await VerifyProjectAsync(database, proposed, checkedProjects,
                (Guid)target[nameof(TodoItem.ProjectId)]!, cancellationToken);
        }
    }

    private static bool Activates(UndoRowSnapshot row, bool forward)
    {
        return (row.EntityType == typeof(Folder) || row.EntityType == typeof(TodoItem))
            && row.Target(forward) is { } target && target[nameof(TodoItem.DeletedAtUtc)] is null
            && (row.Source(forward) is not { } source || source[nameof(TodoItem.DeletedAtUtc)] is not null);
    }

    private static Guid? FolderId(UndoRowSnapshot row, Dictionary<string, object?> target)
    {
        return (Guid?)target[row.EntityType == typeof(Folder) ? nameof(Folder.ParentFolderId) : nameof(TodoItem.FolderId)];
    }

    private static async Task VerifyChainAsync<TEntity>(DbSet<TEntity> table,
        Dictionary<(Type, object), Dictionary<string, object?>?> proposed, HashSet<Guid> checkedIds,
        Guid? parentId, string parentProperty, string nameProperty, Expression<Func<TEntity, Ancestor>> select,
        string kind, CancellationToken cancellationToken) where TEntity : class
    {
        while (parentId is Guid id && checkedIds.Add(id))
        {
            var ancestor = proposed.TryGetValue((typeof(TEntity), id), out var target)
                ? ReadAncestor(target, parentProperty, nameProperty)
                : await table.IgnoreQueryFilters().Where(row => EF.Property<Guid>(row, "Id") == id)
                    .Select(select).SingleOrDefaultAsync(cancellationToken);
            if (ancestor is null)
            {
                throw new DomainRuleException($"The parent {kind} is missing. Restore the parent first.");
            }

            if (ancestor.DeletedAtUtc.HasValue)
            {
                throw new DomainRuleException($"Restore the {kind} '{ancestor.Name}' first");
            }

            parentId = ancestor.ParentId;
        }
    }

    private static Ancestor? ReadAncestor(Dictionary<string, object?>? target, string parentProperty, string nameProperty)
    {
        return target is null ? null : new Ancestor((string)target[nameProperty]!, (Guid?)target[parentProperty],
            (DateTime?)target[nameof(TodoItem.DeletedAtUtc)]);
    }

    private static async Task VerifyProjectAsync(TaskTrackerDbContext database,
        Dictionary<(Type, object), Dictionary<string, object?>?> proposed, HashSet<Guid> checkedProjects, Guid id,
        CancellationToken cancellationToken)
    {
        if (!checkedProjects.Add(id))
        {
            return;
        }

        var active = proposed.TryGetValue((typeof(Project), id), out var target)
            ? target is not null && target[nameof(Project.DeletedAtUtc)] is null
            : await database.Projects.AnyAsync(project => project.Id == id, cancellationToken);
        if (!active)
        {
            throw new DomainRuleException("Restore the project first");
        }
    }

    private sealed record Ancestor(string Name, Guid? ParentId, DateTime? DeletedAtUtc);
}