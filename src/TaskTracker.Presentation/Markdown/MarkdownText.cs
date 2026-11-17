namespace TaskTracker.Presentation.Markdown;

/// <summary>Literal text, exactly as it should be shown.</summary>
public sealed record MarkdownText(string Text) : MarkdownInline;