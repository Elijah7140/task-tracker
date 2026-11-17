namespace TaskTracker.Core.Completion;

/// <summary>The outcome of a requested completion operation.</summary>
public abstract record CompletionResult
{
    private CompletionResult()
    {
    }

    /// <summary>Changes that the application service can persist together.</summary>
    public sealed record Applied(IReadOnlyList<CompletionChange> Changes) : CompletionResult
    {
        /// <summary>At least one rule ended during this completion.</summary>
        public bool LastRepeat { get; init; }
    }

    /// <summary>The number of open descendants that would also be completed.</summary>
    public sealed record NeedsConfirmation(int OpenSubItemCount) : CompletionResult;

    /// <summary>The reason the requested change cannot be applied.</summary>
    public sealed record Blocked(string Reason) : CompletionResult;
}