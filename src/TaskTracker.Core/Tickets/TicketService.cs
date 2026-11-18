using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Undo;

namespace TaskTracker.Core.Tickets;

/// <summary>Reads and changes the independent ordering of open tickets.</summary>
public sealed class TicketService(IUnitOfWorkFactory factory, TimeProvider clock, FieldWriteGate? writeGate = null)
{
    private readonly FieldWriteGate gate = writeGate ?? FieldWriteGate.Shared;

    public async Task<TicketBoard> LoadAsync(Guid? projectId = null, CancellationToken cancellationToken = default)
    {
        await using var work = factory.Begin();
        var projects = await work.Projects.ListAsync(includeDeleted: false, cancellationToken);
        var statuses = await work.Lookups.StatusesAsync(cancellationToken);
        var priorities = await work.Lookups.PriorityLevelsAsync(cancellationToken);
        var items = await work.Tickets.LoadAsync(projectId, cancellationToken);
        return new TicketBoard(BuildSections(items, priorities), projects, statuses, priorities);
    }

    /// <summary>Moves relative to an anchor in the full section, independently of the project filter.</summary>
    public Task<bool> MoveAsync(Guid itemId, TicketPosition position, CancellationToken cancellationToken = default)
    {
        return ChangeAsync(itemId, position, setPriority: false, cancellationToken);
    }

    /// <summary>Changes priority and appends to the destination section in one undoable save.</summary>
    public Task<bool> SetPriorityAsync(Guid itemId, Guid? priorityId, CancellationToken cancellationToken = default)
    {
        return ChangeAsync(itemId, new TicketPosition(priorityId), setPriority: true, cancellationToken);
    }

    private async Task<bool> ChangeAsync(Guid itemId, TicketPosition position, bool setPriority,
        CancellationToken cancellationToken)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = factory.Begin();
        var items = await work.Tickets.LoadAsync(null, cancellationToken);
        var item = items.FirstOrDefault(candidate => candidate.Id == itemId)
            ?? throw new DomainRuleException("This item is no longer an open ticket.");
        var changesSection = item.PriorityLevelId != position.PriorityId;

        if ((setPriority && !changesSection) || position.AnchorId == itemId)
        {
            return false;
        }

        await ValidateDestinationAsync(work, position.PriorityId, changesSection, cancellationToken);
        if (!PlaceTicket(items, item, position, setPriority))
        {
            return false;
        }

        var label = setPriority ? UndoLabels.SetPriority(item.Title) : UndoLabels.Move(item.Title);
        await work.SaveChangesAsync(label, cancellationToken);
        return true;
    }

    private static IReadOnlyList<TicketSection> BuildSections(IReadOnlyList<TodoItem> items,
        IReadOnlyList<PriorityLevel> priorities)
    {
        var grouped = items.ToLookup(item => item.PriorityLevelId);
        var sections = new List<TicketSection> { new(null, TicketRanks.InOrder(grouped[null]).ToArray()) };

        foreach (var priority in priorities.OrderBy(level => level.SortOrder).ThenBy(level => level.Id))
        {
            var section = grouped[priority.Id];
            if (!priority.IsArchived || section.Any())
            {
                sections.Add(new TicketSection(priority, TicketRanks.InOrder(section).ToArray()));
            }
        }

        return sections;
    }

    private static async Task ValidateDestinationAsync(IUnitOfWork work, Guid? priorityId, bool changesSection,
        CancellationToken cancellationToken)
    {
        if (changesSection && priorityId is Guid id)
        {
            var priorities = await work.Lookups.PriorityLevelsAsync(cancellationToken);
            if (!priorities.Any(level => level.Id == id && !level.IsArchived))
            {
                throw new DomainRuleException("Choose an active priority level.");
            }
        }
    }

    private bool PlaceTicket(IReadOnlyList<TodoItem> items, TodoItem item, TicketPosition position, bool append)
    {
        var section = TicketRanks.InOrder(items.Where(candidate => candidate.PriorityLevelId == position.PriorityId)).ToList();
        var previousIndex = section.IndexOf(item);
        section.Remove(item);
        var index = append ? section.Count : InsertionIndex(section, position);
        if (index == previousIndex)
        {
            return false;
        }

        item.SetLookups(item.ItemTypeId, position.PriorityId, clock);
        section.Insert(index, item);
        AssignRanks(section);
        return true;
    }

    private static int InsertionIndex(List<TodoItem> section, TicketPosition position)
    {
        if (position.AnchorId is not Guid anchorId)
        {
            return 0;
        }

        var index = section.FindIndex(item => item.Id == anchorId);
        if (index < 0)
        {
            throw new DomainRuleException("The target ticket has moved or is no longer open.");
        }

        return position.After ? index + 1 : index;
    }

    private static void AssignRanks(List<TodoItem> section)
    {
        for (var index = 0; index < section.Count; index++)
        {
            section[index].SetTicketRank(index);
        }
    }
}