namespace TaskTracker.Core.Transfer;

/// <summary>What a JSON export covers: the whole database or one project.</summary>
public abstract record TransferScope
{
    /// <summary>Every active project, all lookups, fields, settings and saved searches.</summary>
    public sealed record AllData : TransferScope;

    /// <summary>One project, plus the global lookups and fields it uses.</summary>
    public sealed record SingleProject(Guid ProjectId) : TransferScope;
}