namespace TaskTracker.Core.Items;

/// <summary>A status chosen in the item editor; a null <see cref="StatusId"/> means "no status".</summary>
public sealed record StatusChange(Guid? StatusId);