namespace TaskTracker.Core.Transfer.Json;

/// <summary>Reads the timestamps of an imported row, falling back to the import time when the file has none.</summary>
internal static class ImportTimestamps
{
    public static DateTime Created(string? createdText, TimeProvider clock)
    {
        return ImportParse.Utc(createdText) ?? clock.GetUtcNow().UtcDateTime;
    }

    /// <summary>The updated time, or when it is missing the created time.</summary>
    public static DateTime Updated(string? updatedText, string? createdText, TimeProvider clock)
    {
        return ImportParse.Utc(updatedText) ?? Created(createdText, clock);
    }
}