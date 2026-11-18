namespace TaskTracker.Core.Tickets;

/// <summary>A position before or after a ticket in the destination section, or at its start without an anchor.</summary>
public sealed record TicketPosition(Guid? PriorityId, Guid? AnchorId = null, bool After = false);