namespace TaskTracker.Presentation.Markdown;

/// <summary>A bullet list, or a numbered list that starts at <paramref name="StartNumber"/>.</summary>
public sealed record MarkdownList(bool IsOrdered, int StartNumber, IReadOnlyList<MarkdownListItem> Items) : MarkdownBlock;