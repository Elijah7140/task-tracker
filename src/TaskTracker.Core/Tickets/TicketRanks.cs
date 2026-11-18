using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Tickets;

/// <summary>Orders a ticket section and allocates ranks for tickets entering it.</summary>
internal static class TicketRanks
{
    public static IOrderedEnumerable<TodoItem> InOrder(IEnumerable<TodoItem> tickets)
    {
        return tickets.OrderBy(item => !item.TicketRank.HasValue)
            .ThenBy(item => item.TicketRank)
            .ThenBy(item => item.CreatedAtUtc)
            .ThenBy(item => item.Id);
    }

    /// <summary>Appends newly numbered items in input order, preserving the order of legacy unranked tickets.</summary>
    public static async Task AppendNewAsync(IUnitOfWork work, IEnumerable<TodoItem> incoming,
        CancellationToken cancellationToken)
    {
        var additions = incoming.Where(IsOpenTicket).ToLookup(item => item.PriorityLevelId);
        if (additions.Count == 0)
        {
            return;
        }

        var incomingIds = additions.SelectMany(section => section).Select(item => item.Id).ToHashSet();
        var stored = await work.Tickets.LoadAsync(null, cancellationToken);
        var existing = stored.Where(item => IsOpenTicket(item) && !incomingIds.Contains(item.Id))
            .ToLookup(item => item.PriorityLevelId);

        foreach (var section in additions)
        {
            AppendSection(existing[section.Key], section);
        }
    }

    private static bool IsOpenTicket(TodoItem item)
    {
        return item.TicketNumber is not null && item.CompletedAtUtc is null && item.DeletedAtUtc is null;
    }

    private static void AppendSection(IEnumerable<TodoItem> existing, IEnumerable<TodoItem> additions)
    {
        var nextRank = existing.Max(item => item.TicketRank).GetValueOrDefault(-1) + 1;
        var unranked = InOrder(existing.Where(item => item.TicketRank is null));
        foreach (var item in unranked.Concat(additions))
        {
            item.SetTicketRank(nextRank++);
        }
    }
}