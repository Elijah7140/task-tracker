namespace TaskTracker.Core.Transfer.Csv;

/// <summary>One CSV column for a custom field; fields that share a display name share a column.</summary>
internal sealed record CsvFieldColumn(string Header, IReadOnlySet<Guid> FieldIds);