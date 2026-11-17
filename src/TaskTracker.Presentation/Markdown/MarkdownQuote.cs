namespace TaskTracker.Presentation.Markdown;

/// <summary>A block quote holding other blocks.</summary>
public sealed record MarkdownQuote(IReadOnlyList<MarkdownBlock> Blocks) : MarkdownBlock;