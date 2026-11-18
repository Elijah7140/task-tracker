namespace TaskTracker.Core.Reminders;

/// <summary>A due reminder with the information needed for display and delivery.</summary>
public sealed record ReminderEntry(Guid ItemId, string Title, string ProjectName, long InstantTicks)
{
    public DateTime InstantUtc => new(InstantTicks, DateTimeKind.Utc);
}