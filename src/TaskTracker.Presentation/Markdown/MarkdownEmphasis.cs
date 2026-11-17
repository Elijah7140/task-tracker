namespace TaskTracker.Presentation.Markdown;

/// <summary>Italic text, or bold text when <paramref name="IsStrong"/> is true.</summary>
public sealed record MarkdownEmphasis(bool IsStrong, IReadOnlyList<MarkdownInline> Children) : MarkdownInline;