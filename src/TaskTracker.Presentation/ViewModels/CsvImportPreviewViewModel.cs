using TaskTracker.Core.Transfer.Csv;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>The text of the CSV import preview: row count, how columns were read, the first rows and every problem.</summary>
public sealed class CsvImportPreviewViewModel : ViewModelBase
{
    private const int MaxIssuesShown = 30;

    private readonly CsvImportPreview preview;

    public CsvImportPreviewViewModel(CsvImportPreview preview, string fileName, string targetName)
    {
        this.preview = preview;
        Heading = $"Import {fileName}";
        Target = $"Into {targetName}";
        IssueLines = TransferIssueText.Lines(preview.Issues, MaxIssuesShown);
    }

    public string Heading { get; }

    public string Target { get; }

    public string RowSummary => preview.RowCount == 1 ? "1 row" : $"{preview.RowCount} rows";

    /// <summary>The columns that will be used, for example "Columns used: Title, Type".</summary>
    public string ColumnsText => $"Columns used: {JoinOrNone(preview.RecognizedColumns)}";

    /// <summary>Names of columns that match nothing, or null when there are none.</summary>
    public string? UnknownColumnsText
    {
        get
        {
            if (preview.UnknownColumns.Count == 0)
            {
                return null;
            }

            return $"Not recognised and ignored: {string.Join(", ", preview.UnknownColumns)}";
        }
    }

    /// <summary>Export context columns that are read past, or null when there are none.</summary>
    public string? IgnoredColumnsText
    {
        get
        {
            if (preview.IgnoredColumns.Count == 0)
            {
                return null;
            }

            return $"Not imported (context only): {string.Join(", ", preview.IgnoredColumns)}";
        }
    }

    public IReadOnlyList<CsvPreviewRow> SampleRows => preview.SampleRows;

    /// <summary>One line per problem, "Row 3, Type: ...", limited so a large bad file stays readable.</summary>
    public IReadOnlyList<string> IssueLines { get; }

    public bool HasIssues => preview.Issues.Count > 0;

    public bool CanImport => preview.CanImport;

    /// <summary>The line under the table: ready, or why nothing will be imported.</summary>
    public string StatusText
    {
        get
        {
            if (CanImport)
            {
                return $"Ready to import {RowSummary} as new items.";
            }

            return "Nothing will be imported until the problems below are fixed in the file.";
        }
    }

    private static string JoinOrNone(IReadOnlyList<string> names)
    {
        return names.Count == 0 ? "none" : string.Join(", ", names);
    }
}