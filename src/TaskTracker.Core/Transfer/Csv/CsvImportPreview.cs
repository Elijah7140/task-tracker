namespace TaskTracker.Core.Transfer.Csv;

/// <summary>
/// What a CSV import would do, shown before anything is written: how many rows, how the columns were
/// understood, the first rows, and every problem with its row number (the header is row 1).
/// </summary>
public sealed class CsvImportPreview
{
    internal CsvImportPreview(
        int rowCount,
        IReadOnlyList<string> recognizedColumns,
        IReadOnlyList<string> unknownColumns,
        IReadOnlyList<string> ignoredColumns,
        IReadOnlyList<CsvPreviewRow> sampleRows,
        IReadOnlyList<TransferIssue> issues)
    {
        RowCount = rowCount;
        RecognizedColumns = recognizedColumns;
        UnknownColumns = unknownColumns;
        IgnoredColumns = ignoredColumns;
        SampleRows = sampleRows;
        Issues = issues;
    }

    /// <summary>The number of item rows in the file (the header is not counted).</summary>
    public int RowCount { get; }

    /// <summary>Header names that map to an item field or custom field.</summary>
    public IReadOnlyList<string> RecognizedColumns { get; }

    /// <summary>Header names that match nothing; their values are ignored.</summary>
    public IReadOnlyList<string> UnknownColumns { get; }

    /// <summary>Export context columns (Project, Folder path, Parent title) that an import reads past.</summary>
    public IReadOnlyList<string> IgnoredColumns { get; }

    /// <summary>The first rows of the file, so the user can check the columns line up.</summary>
    public IReadOnlyList<CsvPreviewRow> SampleRows { get; }

    /// <summary>Every problem found; nothing is imported while there are any.</summary>
    public IReadOnlyList<TransferIssue> Issues { get; }

    /// <summary>True when the file has rows and no problems.</summary>
    public bool CanImport => RowCount > 0 && Issues.Count == 0;
}