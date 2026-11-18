using TaskTracker.Core.Items;

namespace TaskTracker.Core.Tickets;

/// <summary>Loads eligible tickets, including their tracked item state for rank changes.</summary>
public interface ITicketRepository
{
    Task<IReadOnlyList<TodoItem>> LoadAsync(Guid? projectId, CancellationToken cancellationToken);
}