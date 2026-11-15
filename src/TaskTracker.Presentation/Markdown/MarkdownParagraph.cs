namespace TaskTracker.Presentation.Markdown;

/// <summary>A paragraph of inline content. Raw HTML from the source also ends up here, as literal text.</summary>
public sealed record MarkdownParagraph(IReadOnlyList<MarkdownInline> Inlines) : MarkdownBlock;