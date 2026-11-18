using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Refuses replay when related rows would violate rules that SQLite cannot enforce.</summary>
internal static class UndoDependencyGuard
{
    public static async Task VerifyAsync(TaskTrackerDbContext database, IReadOnlyList<UndoRowSnapshot> rows,
        bool forward, CancellationToken cancellationToken)
    {
        await VerifySoftDeletionAsync(database, rows, forward, cancellationToken);

        foreach (var row in rows)
        {
            var original = forward ? row.Before : row.After;
            var proposed = forward ? row.After : row.Before;
            if (proposed is null)
            {
                continue;
            }

            if (row.EntityType == typeof(FieldDefinition))
            {
                await VerifyFieldAsync(database, (Guid)row.Key[0], original, proposed, cancellationToken);
            }
            else if (row.EntityType == typeof(FieldChoice))
            {
                await VerifyChoiceAsync(database, (Guid)row.Key[0], original, proposed, cancellationToken);
            }
        }
    }

    private static async Task VerifySoftDeletionAsync(TaskTrackerDbContext database, IReadOnlyList<UndoRowSnapshot> rows,
        bool forward, CancellationToken cancellationToken)
    {
        var projects = SoftDeletedIds<Project>(rows, forward);
        var folders = SoftDeletedIds<Folder>(rows, forward);
        var items = SoftDeletedIds<TodoItem>(rows, forward);
        if (projects.Length + folders.Length + items.Length == 0)
        {
            return;
        }

        var activeFolders = database.Folders.IgnoreQueryFilters().Where(folder => folder.DeletedAtUtc == null);
        var activeItems = database.TodoItems.IgnoreQueryFilters().Where(item => item.DeletedAtUtc == null);
        if (await activeFolders.AnyAsync(folder => !folders.Contains(folder.Id) && (projects.Contains(folder.ProjectId)
            || folder.ParentFolderId.HasValue && folders.Contains(folder.ParentFolderId.Value)), cancellationToken)
            || await activeItems.AnyAsync(item => !items.Contains(item.Id) && (projects.Contains(item.ProjectId)
            || item.FolderId.HasValue && folders.Contains(item.FolderId.Value)
            || item.ParentItemId.HasValue && items.Contains(item.ParentItemId.Value)), cancellationToken))
        {
            throw new DomainRuleException("The deleted branch has new contents. Applying this step would leave them in a deleted location.");
        }
    }

    private static Guid[] SoftDeletedIds<TEntity>(IReadOnlyList<UndoRowSnapshot> rows, bool forward)
    {
        const string deletedAt = nameof(TodoItem.DeletedAtUtc);
        return rows.Where(row => row.EntityType == typeof(TEntity)
                && (forward ? row.After : row.Before)?[deletedAt] is not null
                && (forward ? row.Before : row.After)?[deletedAt] is null)
            .Select(row => (Guid)row.Key[0]).ToArray();
    }

    private static async Task VerifyFieldAsync(TaskTrackerDbContext database, Guid id,
        Dictionary<string, object?>? original, Dictionary<string, object?> proposed, CancellationToken cancellationToken)
    {
        if (original is not null && PropertyChanged(original, proposed, nameof(FieldDefinition.DataType))
            && await database.ItemFieldValues.AnyAsync(value => value.FieldDefinitionId == id, cancellationToken))
        {
            throw new DomainRuleException("This field is now in use. Applying this step would change its type.");
        }

        if (proposed[nameof(FieldDefinition.IsArchived)] is true ||
            !PropertyChanged(original, proposed, nameof(FieldDefinition.DisplayName))
            && !PropertyChanged(original, proposed, nameof(FieldDefinition.IsArchived)))
        {
            return;
        }

        var projectId = (Guid?)proposed[nameof(FieldDefinition.ProjectId)];
        var names = await database.FieldDefinitions.Where(field => field.Id != id && !field.IsArchived
                && (field.ProjectId == null || projectId == null || field.ProjectId == projectId))
            .Select(field => field.DisplayName).ToListAsync(cancellationToken);
        if (names.Contains((string)proposed[nameof(FieldDefinition.DisplayName)]!, StringComparer.OrdinalIgnoreCase))
        {
            throw new DomainRuleException("A field with this name is now visible in the same project.");
        }
    }

    private static async Task VerifyChoiceAsync(TaskTrackerDbContext database, Guid id,
        Dictionary<string, object?>? original, Dictionary<string, object?> proposed, CancellationToken cancellationToken)
    {
        if (proposed[nameof(FieldChoice.IsArchived)] is true ||
            !PropertyChanged(original, proposed, nameof(FieldChoice.Label))
            && !PropertyChanged(original, proposed, nameof(FieldChoice.IsArchived)))
        {
            return;
        }

        var fieldId = (Guid)proposed[nameof(FieldChoice.FieldDefinitionId)]!;
        var names = await database.FieldChoices.Where(choice => choice.Id != id && !choice.IsArchived
                && choice.FieldDefinitionId == fieldId)
            .Select(choice => choice.Label).ToListAsync(cancellationToken);
        if (names.Contains((string)proposed[nameof(FieldChoice.Label)]!, StringComparer.OrdinalIgnoreCase))
        {
            throw new DomainRuleException("This choice label is now used by another choice.");
        }
    }

    private static bool PropertyChanged(Dictionary<string, object?>? original,
        Dictionary<string, object?> proposed, string property)
    {
        return original is null || !Equals(original[property], proposed[property]);
    }
}