namespace TaskTracker.Presentation.Markdown;

/// <summary>A heading of level 1 to 6.</summary>
public sealed record MarkdownHeading(int Level, IReadOnlyList<MarkdownInline> Inlines) : MarkdownBlock;