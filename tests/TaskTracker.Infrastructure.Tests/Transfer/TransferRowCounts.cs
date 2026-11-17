namespace TaskTracker.Infrastructure.Tests.Transfer;

/// <summary>How many rows each table holds, deleted rows included; equal counts before and after mean nothing changed.</summary>
internal sealed record TransferRowCounts(
    int Projects,
    int Folders,
    int Items,
    int ItemTypes,
    int PriorityLevels,
    int Fields,
    int Choices,
    int FieldValues,
    int SavedSearches,
    int ProjectSettings);