namespace TaskTracker.Infrastructure.Persistence;

/// <summary>A project override stored as invariant text.</summary>
public sealed class ProjectSettingRow
{
    public Guid ProjectId { get; set; }

    public string Key { get; set; } = string.Empty;

    public string Value { get; set; } = string.Empty;
}