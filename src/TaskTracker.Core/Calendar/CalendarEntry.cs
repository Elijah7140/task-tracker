using TaskTracker.Core.Settings;
using TaskTracker.Core.Urgency;

namespace TaskTracker.Core.Calendar;

/// <summary>One due date or scheduled block returned by the calendar query.</summary>
public sealed record CalendarEntry(
    Guid ItemId,
    Guid ProjectId,
    Guid? FolderId,
    string Title,
    CalendarEntryKind Kind,
    DateOnly Date,
    TimeOnly? StartTime,
    DateTime? ScheduledStart,
    DateTime? ScheduledEnd,
    bool IsCompleted,
    DateOnly? DueDate,
    TimeOnly? DueTime,
    string? ItemType,
    string? Priority)
{
    /// <summary>Length of the block drawn for a schedule that has no usable end.</summary>
    public static readonly TimeSpan DefaultBlockLength = TimeSpan.FromMinutes(30);

    /// <summary>
    /// The thresholds that apply to the item's project. The service fills these in; until then
    /// they are the application defaults.
    /// </summary>
    public UrgencyThresholds Thresholds { get; init; } = new(
        SettingsCatalogue.UrgencyYellowThreshold.DefaultValue,
        SettingsCatalogue.UrgencyRedThreshold.DefaultValue);

    /// <summary>
    /// The end of the scheduled block. A missing end, or an end that is not after the start,
    /// gives a block of <see cref="DefaultBlockLength"/>.
    /// </summary>
    public DateTime? EffectiveScheduledEnd
    {
        get
        {
            if (ScheduledStart is not DateTime start)
            {
                return null;
            }

            if (ScheduledEnd is DateTime end && end > start)
            {
                return end;
            }

            return start + DefaultBlockLength;
        }
    }
}