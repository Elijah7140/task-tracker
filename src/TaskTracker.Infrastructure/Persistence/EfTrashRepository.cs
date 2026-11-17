using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Trash;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>EF queries that look at deleted rows, and the permanent removal of rows.</summary>
public sealed class EfTrashRepository(TaskTrackerDbContext database) : ITrashRepository
{
    public async Task<IReadOnlyList<Guid>> ListProjectIdsWithDeletionsAsync(Guid? projectId, CancellationToken cancellationToken)
    {
        var ids = new HashSet<Guid>();
        ids.UnionWith(await DeletedProjectIdsAsync(projectId, cancellationToken));
        ids.UnionWith(await ProjectIdsWithDeletedFoldersAsync(projectId, cancellationToken));
        ids.UnionWith(await ProjectIdsWithDeletedItemsAsync(projectId, cancellationToken));
        return ids.ToArray();
    }

    public async Task<Guid?> FindProjectIdAsync(Guid batchId, CancellationToken cancellationToken)
    {
        var projectId = await database.Projects.IgnoreQueryFilters().AsNoTracking()
            .Where(project => project.DeletionBatchId == batchId)
            .Select(project => (Guid?)project.Id)
            .FirstOrDefaultAsync(cancellationToken);

        projectId ??= await database.Folders.IgnoreQueryFilters().AsNoTracking()
            .Where(folder => folder.DeletionBatchId == batchId)
            .Select(folder => (Guid?)folder.ProjectId)
            .FirstOrDefaultAsync(cancellationToken);

        projectId ??= await database.TodoItems.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.DeletionBatchId == batchId)
            .Select(item => (Guid?)item.ProjectId)
            .FirstOrDefaultAsync(cancellationToken);

        return projectId;
    }

    public void Remove(Project project)
    {
        database.Projects.Remove(project);
    }

    public void Remove(Folder folder)
    {
        database.Folders.Remove(folder);
    }

    public void Remove(TodoItem item)
    {
        database.TodoItems.Remove(item);
    }

    public async Task RemoveProjectOwnedDataAsync(Guid projectId, CancellationToken cancellationToken)
    {
        var fields = await database.FieldDefinitions
            .Where(field => field.ProjectId == projectId)
            .ToListAsync(cancellationToken);
        var fieldIds = fields.Select(field => field.Id).ToList();

        await RemoveFieldValuesAsync(fieldIds, cancellationToken);
        await RemoveFieldChoicesAsync(fieldIds, cancellationToken);
        database.FieldDefinitions.RemoveRange(fields);
        database.ProjectSettings.RemoveRange(await database.ProjectSettings
            .Where(row => row.ProjectId == projectId)
            .ToListAsync(cancellationToken));
    }

    private async Task<List<Guid>> DeletedProjectIdsAsync(Guid? projectId, CancellationToken cancellationToken)
    {
        return await database.Projects.IgnoreQueryFilters().AsNoTracking()
            .Where(project => project.DeletedAtUtc != null)
            .Where(project => projectId == null || project.Id == projectId)
            .Select(project => project.Id)
            .ToListAsync(cancellationToken);
    }

    private async Task<List<Guid>> ProjectIdsWithDeletedFoldersAsync(Guid? projectId, CancellationToken cancellationToken)
    {
        return await database.Folders.IgnoreQueryFilters().AsNoTracking()
            .Where(folder => folder.DeletedAtUtc != null)
            .Where(folder => projectId == null || folder.ProjectId == projectId)
            .Select(folder => folder.ProjectId)
            .Distinct()
            .ToListAsync(cancellationToken);
    }

    private async Task<List<Guid>> ProjectIdsWithDeletedItemsAsync(Guid? projectId, CancellationToken cancellationToken)
    {
        return await database.TodoItems.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.DeletedAtUtc != null)
            .Where(item => projectId == null || item.ProjectId == projectId)
            .Select(item => item.ProjectId)
            .Distinct()
            .ToListAsync(cancellationToken);
    }

    private async Task RemoveFieldValuesAsync(List<Guid> fieldIds, CancellationToken cancellationToken)
    {
        database.ItemFieldValues.RemoveRange(await database.ItemFieldValues
            .Where(value => fieldIds.Contains(value.FieldDefinitionId))
            .ToListAsync(cancellationToken));
    }

    private async Task RemoveFieldChoicesAsync(List<Guid> fieldIds, CancellationToken cancellationToken)
    {
        database.FieldChoices.RemoveRange(await database.FieldChoices
            .Where(choice => fieldIds.Contains(choice.FieldDefinitionId))
            .ToListAsync(cancellationToken));
    }
}