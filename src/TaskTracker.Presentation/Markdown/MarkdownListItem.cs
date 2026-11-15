namespace TaskTracker.Presentation.Markdown;

/// <summary>One list entry. <paramref name="IsChecked"/> is null for an ordinary entry and true or false for a task-list entry.</summary>
public sealed record MarkdownListItem(IReadOnlyList<MarkdownBlock> Blocks, bool? IsChecked);