using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Transfer.Csv;

/// <summary>Adds validated CSV rows to an area as new top-level items after the items already there.</summary>
internal static class CsvItemImporter
{
    public static async Task AddItemsAsync(IUnitOfWork work, IReadOnlyList<CsvImportRow> rows,
        Guid projectId, Guid? folderId, TimeProvider clock, CancellationToken cancellationToken)
    {
        var existing = await work.Items.LoadAreaAsync(projectId, folderId, cancellationToken);
        var topLevelOrders = existing.Where(item => item.ParentItemId is null).Select(item => item.SortOrder);
        var nextOrder = topLevelOrders.DefaultIfEmpty(-1).Max() + 1;

        foreach (var row in rows)
        {
            var item = CreateItem(row, projectId, folderId, nextOrder++, clock);
            work.Items.Add(item);

            foreach (var value in row.FieldValues)
            {
                work.Fields.Add(ItemFieldValue.Create(item.Id, value));
            }

            AddLinks(work, item, row, clock);
        }
    }

    private static void AddLinks(IUnitOfWork work, TodoItem item, CsvImportRow row, TimeProvider clock)
    {
        for (var position = 0; position < row.LinkUrls.Count; position++)
        {
            var input = new ItemLinkInput(null, row.LinkUrls[position], null);
            work.Items.Add(ItemLink.Create(item.Id, input, position, clock));
        }
    }

    private static TodoItem CreateItem(CsvImportRow row, Guid projectId, Guid? folderId, int sortOrder, TimeProvider clock)
    {
        var item = TodoItem.Create(projectId, folderId, null, row.Title, clock, sortOrder);

        if (row.Description is not null)
        {
            item.SetDescription(row.Description, clock);
        }

        item.SetTicketNumber(row.TicketNumber, clock);
        item.SetLookups(row.ItemTypeId, row.PriorityLevelId, clock);
        item.SetDue(row.DueDate, row.DueTime, clock);
        item.SetSchedule(row.ScheduledStart, row.ScheduledEnd, clock);

        if (row.CompletedAtUtc is not null)
        {
            item.SetCompletion(row.CompletedAtUtc, clock);
        }

        return item;
    }
}