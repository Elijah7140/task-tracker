namespace TaskTracker.Core.Transfer.Csv;

/// <summary>The fixed column headers of the CSV format; custom fields add columns named after their display names.</summary>
internal static class CsvColumns
{
    private const string FieldSuffix = " (field)";

    public const string Title = "Title";
    public const string Description = "Description";
    public const string Ticket = "Ticket";
    public const string Type = "Type";
    public const string Priority = "Priority";
    public const string PriorityReference = "Priority reference";
    public const string Status = "Status";
    public const string DueDate = "Due date";
    public const string DueTime = "Due time";
    public const string ScheduledStart = "Scheduled start";
    public const string ScheduledEnd = "Scheduled end";
    public const string Completed = "Completed";
    public const string CompletedAt = "Completed at";
    public const string Project = "Project";
    public const string FolderPath = "Folder path";
    public const string ParentTitle = "Parent title";
    public const string Links = "Links";
    public const string Repeats = "Repeats";

    /// <summary>Every fixed column, in the order an export writes them.</summary>
    public static IReadOnlyList<string> Standard { get; } =
    [
        Title, Description, Ticket, Type, Priority, PriorityReference, Status, DueDate, DueTime, ScheduledStart, ScheduledEnd,
        Completed, CompletedAt, Project, FolderPath, ParentTitle, Links, Repeats
    ];

    /// <summary>
    /// Adds one suffix to fixed names and their suffixed variants, giving each display name a stable header
    /// even when other custom fields are absent from the export or import.
    /// </summary>
    public static string FieldHeader(string displayName)
    {
        var baseName = displayName;

        while (baseName.EndsWith(FieldSuffix, StringComparison.OrdinalIgnoreCase))
        {
            baseName = baseName[..^FieldSuffix.Length];
        }

        return Standard.Contains(baseName, StringComparer.OrdinalIgnoreCase) ? displayName + FieldSuffix : displayName;
    }

    /// <summary>Columns an export writes for context that an import recognises but does not use.</summary>
    public static IReadOnlyList<string> IgnoredOnImport { get; } = [Project, FolderPath, ParentTitle, Repeats];
}