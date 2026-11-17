namespace TaskTracker.Presentation.Markdown;

/// <summary>A line break. Single newlines are kept as breaks, so plain text written before Markdown looks the same.</summary>
public sealed record MarkdownLineBreak : MarkdownInline;