namespace TaskTracker.Presentation.Markdown;

/// <summary>A fenced or indented code block, shown verbatim.</summary>
public sealed record MarkdownCodeBlock(string Text) : MarkdownBlock;