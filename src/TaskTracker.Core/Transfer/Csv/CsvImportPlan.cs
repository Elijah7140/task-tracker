namespace TaskTracker.Core.Transfer.Csv;

/// <summary>The preview of an import file together with the validated rows that would be created.</summary>
internal sealed record CsvImportPlan(CsvImportPreview Preview, IReadOnlyList<CsvImportRow> Rows);