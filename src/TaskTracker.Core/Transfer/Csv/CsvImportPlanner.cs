namespace TaskTracker.Core.Transfer.Csv;

/// <summary>Reads an import file against a context and produces the preview and the rows to create (§7.9).</summary>
internal static class CsvImportPlanner
{
    private const int SampleRowCount = 5;

    public static CsvImportPlan Plan(string text, CsvImportContext context, TimeProvider clock)
    {
        var table = CsvParser.Parse(text);
        var issues = new IssueList();

        foreach (var syntaxIssue in table.Issues)
        {
            issues.Add(syntaxIssue.Path, syntaxIssue.Message);
        }

        if (table.Records.Count == 0)
        {
            issues.Add("Row 1", "The file is empty; it needs a header row.");
            return new CsvImportPlan(CreatePreview(0, CsvHeader.None(), [], issues), []);
        }

        return PlanRecords(table.Records, context, clock, issues);
    }

    /// <summary>Reads the header, then (only when the header is usable) every item row.</summary>
    private static CsvImportPlan PlanRecords(
        IReadOnlyList<CsvRecord> records, CsvImportContext context, TimeProvider clock, IssueList issues)
    {
        var problemsBeforeHeader = issues.Count;
        var header = CsvHeader.Read(records[0], context, issues);
        var dataRecords = records.Skip(1).ToList();
        var headerIsValid = issues.Count == problemsBeforeHeader;
        var rows = headerIsValid ? ReadRows(dataRecords, header, context, clock, issues) : [];

        if (headerIsValid && dataRecords.Count == 0)
        {
            issues.Add("Row 2", "The file has a header but no item rows.");
        }

        var sample = CreateSample(dataRecords, header, rows);

        return new CsvImportPlan(CreatePreview(dataRecords.Count, header, sample, issues), rows);
    }

    private static List<CsvImportRow> ReadRows(IReadOnlyList<CsvRecord> records, CsvHeader header,
        CsvImportContext context, TimeProvider clock, IssueList issues)
    {
        var rows = new List<CsvImportRow>();

        foreach (var record in records)
        {
            CheckCellCount(record, header, issues);
            var row = new CsvRowReader(header, context, clock, record, issues).Read();

            if (row is not null)
            {
                rows.Add(row);
            }
        }

        return rows;
    }

    private static void CheckCellCount(CsvRecord record, CsvHeader header, IssueList issues)
    {
        if (record.Cells.Count > header.ColumnCount)
        {
            issues.Add($"Row {record.RowNumber}",
                $"The row has {record.Cells.Count} cells but the header has {header.ColumnCount} columns.");
        }
    }

    private static List<CsvPreviewRow> CreateSample(
        IReadOnlyList<CsvRecord> records, CsvHeader header, IReadOnlyList<CsvImportRow> validRows)
    {
        var validNumbers = validRows.Select(row => row.RowNumber).ToHashSet();

        return records.Take(SampleRowCount)
            .Select(record => CreateSampleRow(record, header, validNumbers.Contains(record.RowNumber)))
            .ToList();
    }

    private static CsvPreviewRow CreateSampleRow(CsvRecord record, CsvHeader header, bool isValid)
    {
        return new CsvPreviewRow(
            record.RowNumber,
            header.CellText(record, CsvColumns.Title),
            header.CellText(record, CsvColumns.Type),
            header.CellText(record, CsvColumns.Priority),
            header.CellText(record, CsvColumns.DueDate),
            !isValid);
    }

    private static CsvImportPreview CreatePreview(int rowCount, CsvHeader header,
        IReadOnlyList<CsvPreviewRow> sample, IssueList issues)
    {
        var ordered = issues.Items.OrderBy(issue => RowOf(issue.Path)).ToList();

        return new CsvImportPreview(rowCount, header.Recognized, header.Unknown, header.Ignored, sample, ordered);
    }

    private static int RowOf(string path)
    {
        var parts = path.Split(' ');
        var number = parts.Length > 1 ? parts[1].TrimEnd(',') : string.Empty;

        return int.TryParse(number, out var row) ? row : 0;
    }
}