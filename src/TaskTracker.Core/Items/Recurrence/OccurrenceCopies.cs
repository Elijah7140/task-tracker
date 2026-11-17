using TaskTracker.Core.Fields;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Items.Recurrence;

/// <summary>Builds open copies in the tree, then adds their dependent rows to the same save.</summary>
internal sealed class OccurrenceCopies(ItemTree tree, TimeProvider clock)
{
    private readonly List<(TodoItem Source, TodoItem Copy)> copies = [];

    public void Add(TodoItem source, DateOnly next, RecurrenceRule rule)
    {
        var siblings = tree.Children(source.ParentItemId).ToList();
        var days = next.DayNumber - source.RecurrenceDate!.Value.DayNumber;
        var root = CopyBranch(source, source.ParentItemId, days, OccurrenceDates.AdvanceRule(rule), source.RecurrenceSeriesId);
        var sourceIndex = siblings.IndexOf(source);
        siblings.Insert(sourceIndex + 1, root);

        for (var index = 0; index < siblings.Count; index++)
        {
            if (siblings[index].SortOrder != index)
            {
                siblings[index].SetSortOrder(index, clock);
            }
        }
    }

    private TodoItem CopyBranch(TodoItem source, Guid? parentId, int days, RecurrenceRule? rule, Guid? seriesId)
    {
        var copy = TodoItem.Create(source.ProjectId, source.FolderId, parentId, source.Title, clock, source.SortOrder);
        copy.SetDescription(source.Description, clock);
        copy.SetTicketNumber(source.TicketNumber, clock);
        copy.SetLookups(source.ItemTypeId, source.PriorityLevelId, clock);
        copy.SetDue(source.DueDate, source.DueTime, clock);
        copy.SetSchedule(source.ScheduledStart, source.ScheduledEnd, clock);
        OccurrenceDates.Shift(copy, days, clock);
        copy.SetRecurrence(rule, clock, seriesId);
        tree.Add(copy);
        copies.Add((source, copy));

        foreach (var child in tree.Children(source.Id))
        {
            CopyBranch(child, copy.Id, days, child.Recurrence, null);
        }

        return copy;
    }

    public async Task PersistAsync(IUnitOfWork work, CancellationToken cancellationToken)
    {
        foreach (var (source, copy) in copies)
        {
            work.Items.Add(copy);
            await CopyFieldsAsync(work.Fields, source.Id, copy.Id, cancellationToken);
            await CopyLinksAsync(work.Items, source.Id, copy.Id, cancellationToken);
        }
    }

    private static async Task CopyFieldsAsync(IFieldRepository fields, Guid sourceId, Guid copyId, CancellationToken cancellationToken)
    {
        var values = await fields.ValuesAsync(sourceId, cancellationToken);
        foreach (var value in values)
        {
            var input = new FieldValueInput(value.FieldDefinitionId, value.TextValue,
                value.NumberValue, value.DateValue, value.BoolValue, value.ChoiceId);
            fields.Add(ItemFieldValue.Create(copyId, input));
        }
    }

    private async Task CopyLinksAsync(IItemRepository items, Guid sourceId, Guid copyId, CancellationToken cancellationToken)
    {
        var links = await items.LinksAsync(sourceId, cancellationToken);
        foreach (var link in links)
        {
            var input = new ItemLinkInput(null, link.Url, link.Title);
            items.Add(ItemLink.Create(copyId, input, link.SortOrder, clock));
        }
    }
}