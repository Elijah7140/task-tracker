using TaskTracker.Core.Lookups;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>A drop target and the visible rows in one Tickets section.</summary>
public sealed record TicketSectionViewModel(PriorityLevel? Priority, IReadOnlyList<TicketRowViewModel> Rows)
{
    public Guid? PriorityId => Priority?.Id;

    public string Label => Priority?.Label ?? "No priority";

    public bool AcceptsNewTickets => Priority?.IsArchived != true;
}