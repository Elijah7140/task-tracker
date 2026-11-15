using TaskTracker.Core.Completion;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// Applies the auto-complete rule (§6.1) to the items of an imported project before they are saved,
/// so data exported with the setting off still satisfies it where the setting is on.
/// </summary>
internal static class ImportCompletion
{
    public static void Reconcile(Guid projectId, IReadOnlyList<Folder> folders, IReadOnlyList<TodoItem> items,
        TimeProvider clock)
    {
        var folderTree = new FolderTree(projectId, folders);
        var nowUtc = clock.GetUtcNow().UtcDateTime;

        foreach (var area in items.GroupBy(item => item.FolderId))
        {
            var tree = new ItemTree(projectId, area.Key, area, folderTree);
            var result = CompletionService.ReconcileAll(tree, nowUtc);

            foreach (var change in result.Changes)
            {
                tree.Get(change.ItemId).SetCompletion(change.CompletedAtUtc, clock);
            }
        }
    }
}