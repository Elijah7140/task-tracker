namespace TaskTracker.Core.Items;

/// <summary>A task or sub-item in one project area.</summary>
public sealed class TodoItem
{
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
        if (value?.Length > 100)
        {
            throw new ArgumentException("Ticket number exceeds 100 characters.", nameof(value));
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

    private void Touch(TimeProvider clock)
    {
        UpdatedAtUtc = clock.GetUtcNow().UtcDateTime;
    }

    private static string ValidTitle(string title)
    {
        if (string.IsNullOrWhiteSpace(title) || title.Length > 300)
        {
            throw new ArgumentException("Title must be 1 to 300 characters.", nameof(title));
        }

        return title.Trim();
    }
}