namespace TaskTracker.Core.Transfer.Csv;

/// <summary>The fixed column headers of the CSV format; custom fields add columns named after their display names.</summary>
internal static class CsvColumns
{
    public const string Title = "Title";
    public const string Description = "Description";
    public const string Ticket = "Ticket";
    public const string Type = "Type";
    public const string Priority = "Priority";
    public const string DueDate = "Due date";
    public const string DueTime = "Due time";
    public const string ScheduledStart = "Scheduled start";
    public const string ScheduledEnd = "Scheduled end";
    public const string Completed = "Completed";
    public const string CompletedAt = "Completed at";
    public const string Project = "Project";
    public const string FolderPath = "Folder path";
    public const string ParentTitle = "Parent title";

    /// <summary>Every fixed column, in the order an export writes them.</summary>
    public static IReadOnlyList<string> Standard { get; } =
    [
        Title, Description, Ticket, Type, Priority, DueDate, DueTime, ScheduledStart, ScheduledEnd,
        Completed, CompletedAt, Project, FolderPath, ParentTitle
    ];

    /// <summary>
    /// The header of the column for a custom field: its display name, or "name (field)" when the name equals a
    /// fixed header, so the header row never holds the same name twice and an import can tell them apart.
    /// </summary>
    public static string FieldHeader(string displayName)
    {
        var collides = Standard.Any(column => string.Equals(column, displayName.Trim(), StringComparison.OrdinalIgnoreCase));

        return collides ? $"{displayName} (field)" : displayName;
    }

    /// <summary>Columns an export writes for context that an import recognises but does not use.</summary>
    public static IReadOnlyList<string> IgnoredOnImport { get; } = [Project, FolderPath, ParentTitle];
}