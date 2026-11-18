using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Tickets;

/// <summary>The ordered ticket sections and lookups used by the project filter and row menus.</summary>
public sealed record TicketBoard(IReadOnlyList<TicketSection> Sections, IReadOnlyList<Project> Projects,
    IReadOnlyList<StatusLevel> Statuses, IReadOnlyList<PriorityLevel> Priorities);