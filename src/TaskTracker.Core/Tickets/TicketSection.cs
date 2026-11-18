using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;

namespace TaskTracker.Core.Tickets;

/// <summary>A priority section of the ticket board. A null priority represents No priority.</summary>
public sealed record TicketSection(PriorityLevel? Priority, IReadOnlyList<TodoItem> Items);