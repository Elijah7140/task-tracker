using TaskTracker.Core.Items;

namespace TaskTracker.Core.Transfer.Csv;

/// <summary>Orders a project's items the way they read on screen: root items, then each folder in turn, sub-items under their parent.</summary>
internal sealed class CsvItemOrder
{
    private readonly ProjectExportData data;
    private readonly List<TodoItem> ordered = [];

    private CsvItemOrder(ProjectExportData data)
    {
        this.data = data;
    }

    public static IReadOnlyList<TodoItem> Order(ProjectExportData data)
    {
        var order = new CsvItemOrder(data);
        order.AddArea(null);

        return order.ordered;
    }

    private void AddArea(Guid? folderId)
    {
        var topLevel = data.Items
            .Where(item => item.FolderId == folderId && item.ParentItemId is null)
            .OrderBy(item => item.SortOrder)
            .ThenBy(item => item.CreatedAtUtc);

        foreach (var item in topLevel)
        {
            AddWithChildren(item);
        }

        var subfolders = data.Folders.Where(folder => folder.ParentFolderId == folderId).OrderBy(folder => folder.SortOrder);

        foreach (var folder in subfolders)
        {
            AddArea(folder.Id);
        }
    }

    private void AddWithChildren(TodoItem item)
    {
        ordered.Add(item);
        var children = data.Items.Where(child => child.ParentItemId == item.Id).OrderBy(child => child.SortOrder);

        foreach (var child in children)
        {
            AddWithChildren(child);
        }
    }
}