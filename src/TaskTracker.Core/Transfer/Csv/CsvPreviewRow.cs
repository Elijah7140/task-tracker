namespace TaskTracker.Core.Transfer.Csv;

/// <summary>A row of the import file as the user wrote it, shown in the preview with whether it has errors.</summary>
public sealed record CsvPreviewRow(
    int RowNumber, string Title, string Type, string Priority, string DueDate, bool HasError);