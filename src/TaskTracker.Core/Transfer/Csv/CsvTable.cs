namespace TaskTracker.Core.Transfer.Csv;

/// <summary>The records of a CSV file (blank lines left out) and any syntax problems found while reading it.</summary>
internal sealed record CsvTable(IReadOnlyList<CsvRecord> Records, IReadOnlyList<TransferIssue> Issues);