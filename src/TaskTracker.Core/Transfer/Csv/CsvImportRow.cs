using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Transfer.Csv;

/// <summary>One validated row of an import file, with its lookups already resolved to ids.</summary>
internal sealed record CsvImportRow(
    int RowNumber,
    string Title,
    string? Description,
    string? TicketNumber,
    Guid? ItemTypeId,
    Guid? PriorityLevelId,
    Guid? StatusId,
    DateOnly? DueDate,
    TimeOnly? DueTime,
    DateTime? ScheduledStart,
    DateTime? ScheduledEnd,
    DateTime? CompletedAtUtc,
    IReadOnlyList<FieldValueInput> FieldValues,
    IReadOnlyList<string> LinkUrls);