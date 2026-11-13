namespace TaskTracker.Infrastructure.Persistence;

/// <summary>A global setting stored as invariant text.</summary>
public sealed class GlobalSettingRow
{
    public string Key { get; set; } = string.Empty;

    public string Value { get; set; } = string.Empty;
}