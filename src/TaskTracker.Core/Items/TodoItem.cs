using TaskTracker.Core.Items.Recurrence;

namespace TaskTracker.Core.Items;

/// <summary>A task or sub-item in one project area.</summary>
public sealed class TodoItem
{
    /// <summary>The longest title an item may have, once trimmed.</summary>
    public const int TitleMaxLength = 300;

    /// <summary>The longest ticket number an item may have, once trimmed.</summary>
    public const int TicketNumberMaxLength = 100;

    private TodoItem()
    {
    }

    public Guid Id { get; private set; }

    public Guid ProjectId { get; private set; }

    public Guid? FolderId { get; private set; }

    public Guid? ParentItemId { get; private set; }

    public string Title { get; private set; } = string.Empty;

    public string? Description { get; private set; }

    public string? TicketNumber { get; private set; }

    public Guid? PriorityLevelId { get; private set; }

    public Guid? ItemTypeId { get; private set; }

    public DateOnly? DueDate { get; private set; }

    public TimeOnly? DueTime { get; private set; }

    public DateTime? ScheduledStart { get; private set; }

    public DateTime? ScheduledEnd { get; private set; }

    private RecurrenceFrequency? RecurrenceFrequency { get; set; }

    private int? RecurrenceInterval { get; set; }

    private RecurrenceWeekdays? RecurrenceWeekdays { get; set; }

    private int? RecurrenceMonthDay { get; set; }

    private int? RecurrenceMonth { get; set; }

    private RecurrenceAnchor? RecurrenceAnchor { get; set; }

    private RecurrenceEndKind? RecurrenceEndKind { get; set; }

    private DateOnly? RecurrenceEndDate { get; set; }

    private int? RecurrenceRemaining { get; set; }

    public Guid? RecurrenceSeriesId { get; private set; }

    public RecurrenceRule? Recurrence
    {
        get
        {
            if (RecurrenceFrequency is not { } frequency)
            {
                return null;
            }

            return new RecurrenceRule(frequency, RecurrenceInterval!.Value, RecurrenceWeekdays,
                RecurrenceMonthDay, RecurrenceMonth, RecurrenceAnchor!.Value,
                RecurrenceEndKind!.Value, RecurrenceEndDate, RecurrenceRemaining);
        }
    }

    /// <summary>The floating date used when advancing this item's due date or scheduled block.</summary>
    public DateOnly? RecurrenceDate => DueDate ?? (ScheduledStart is { } start ? DateOnly.FromDateTime(start) : null);

    /// <summary>Sets the rule and keeps the series identity when the rule is edited.</summary>
    public void SetRecurrence(RecurrenceRule? rule, TimeProvider clock, Guid? seriesId = null)
    {
        if (rule?.FindError() is { } error)
        {
            throw new DomainRuleException(error.Message);
        }

        if (rule is not null && RecurrenceDate is null)
        {
            throw new DomainRuleException("A repeating item needs a due date or a scheduled start.");
        }

        RecurrenceFrequency = rule?.Frequency;
        RecurrenceInterval = rule?.Interval;
        RecurrenceWeekdays = rule?.Weekdays;
        RecurrenceMonthDay = rule?.MonthDay;
        RecurrenceMonth = rule?.Month;
        RecurrenceAnchor = rule?.Anchor;
        RecurrenceEndKind = rule?.EndKind;
        RecurrenceEndDate = rule?.EndDate;
        RecurrenceRemaining = rule?.Remaining;
        RecurrenceSeriesId = rule is null ? null : seriesId ?? RecurrenceSeriesId ?? Guid.CreateVersion7();
        Touch(clock);
    }

    public DateTime? CompletedAtUtc { get; private set; }

    public int SortOrder { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public DateTime? DeletedAtUtc { get; private set; }

    public Guid? DeletionBatchId { get; private set; }

    public static TodoItem Create(Guid projectId, Guid? folderId, Guid? parentItemId, string title, TimeProvider clock, int sortOrder = 0)
    {
        var nowUtc = clock.GetUtcNow().UtcDateTime;

        return new TodoItem
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            FolderId = folderId,
            ParentItemId = parentItemId,
            Title = ValidTitle(title),
            SortOrder = sortOrder,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc
        };
    }

    public void Rename(string title, TimeProvider clock)
    {
        Title = ValidTitle(title);
        Touch(clock);
    }

    public void SetDescription(string? value, TimeProvider clock)
    {
        Description = value;
        Touch(clock);
    }

    public void SetTicketNumber(string? value, TimeProvider clock)
    {
        if (!IsTicketNumberValid(value))
        {
            throw new ArgumentException($"Ticket number exceeds {TicketNumberMaxLength} characters.", nameof(value));
        }

        TicketNumber = string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        Touch(clock);
    }

    public void SetLookups(Guid? typeId, Guid? priorityId, TimeProvider clock)
    {
        ItemTypeId = typeId;
        PriorityLevelId = priorityId;
        Touch(clock);
    }

    public void SetDue(DateOnly? date, TimeOnly? time, TimeProvider clock)
    {
        if (date is null && time is not null)
        {
            throw new ArgumentException("Due time requires a due date.", nameof(time));
        }

        DueDate = date;
        DueTime = time;
        Touch(clock);
    }

    public void SetSchedule(DateTime? start, DateTime? end, TimeProvider clock)
    {
        if (end is not null && (start is null || end < start))
        {
            throw new ArgumentException("Scheduled end requires a start no later than the end.", nameof(end));
        }

        if (start?.Kind == DateTimeKind.Utc || end?.Kind == DateTimeKind.Utc)
        {
            throw new ArgumentException("Scheduled times must be floating local values.", nameof(start));
        }

        ScheduledStart = start;
        ScheduledEnd = end;
        Touch(clock);
    }

    public void SetSortOrder(int value, TimeProvider clock)
    {
        SortOrder = value;
        Touch(clock);
    }

    internal void MoveTo(Guid? folderId, Guid? parentId, TimeProvider clock)
    {
        FolderId = folderId;
        ParentItemId = parentId;
        Touch(clock);
    }

    public void SetCompletion(DateTime? completedAtUtc, TimeProvider clock)
    {
        if (completedAtUtc is not null && completedAtUtc.Value.Kind != DateTimeKind.Utc)
        {
            throw new ArgumentException("Completion time must be UTC.", nameof(completedAtUtc));
        }

        CompletedAtUtc = completedAtUtc;
        Touch(clock);
    }

    public void Delete(Guid batchId, TimeProvider clock)
    {
        if (DeletedAtUtc is not null)
        {
            return;
        }

        DeletedAtUtc = clock.GetUtcNow().UtcDateTime;
        DeletionBatchId = batchId;
        Touch(clock);
    }

    public void Restore(TimeProvider clock)
    {
        DeletedAtUtc = null;
        DeletionBatchId = null;
        Touch(clock);
    }

    /// <summary>Restores the stored timestamps when data is imported, instead of stamping the import time.</summary>
    internal void RestoreTimestamps(DateTime createdAtUtc, DateTime updatedAtUtc)
    {
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = updatedAtUtc;
    }

    private void Touch(TimeProvider clock)
    {
        UpdatedAtUtc = clock.GetUtcNow().UtcDateTime;
    }

    /// <summary>True for a title that is not blank and, once trimmed, fits <see cref="TitleMaxLength"/>.</summary>
    public static bool IsTitleValid(string? title)
    {
        return !string.IsNullOrWhiteSpace(title) && title.Trim().Length <= TitleMaxLength;
    }

    /// <summary>True for no ticket number, or one that, once trimmed, fits <see cref="TicketNumberMaxLength"/>.</summary>
    public static bool IsTicketNumberValid(string? value)
    {
        return value is null || value.Trim().Length <= TicketNumberMaxLength;
    }

    private static string ValidTitle(string title)
    {
        if (!IsTitleValid(title))
        {
            throw new ArgumentException($"Title must be 1 to {TitleMaxLength} characters.", nameof(title));
        }

        return title.Trim();
    }
}