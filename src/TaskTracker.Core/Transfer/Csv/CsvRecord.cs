namespace TaskTracker.Core.Transfer.Csv;

/// <summary>One parsed CSV record. <paramref name="RowNumber"/> counts like a spreadsheet: the header is row 1.</summary>
internal sealed record CsvRecord(int RowNumber, IReadOnlyList<string> Cells);