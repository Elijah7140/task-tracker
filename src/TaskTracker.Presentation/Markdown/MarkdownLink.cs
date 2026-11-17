using TaskTracker.Core.Items;

namespace TaskTracker.Presentation.Markdown;

/// <summary>
/// A link, or an image shown as a link to its address (§7.10: images are never loaded). The view makes it
/// clickable only when <paramref name="IsOpenable"/> is true, which follows <see cref="LinkPolicy"/>.
/// </summary>
public sealed record MarkdownLink(string Url, bool IsOpenable, bool IsImage, IReadOnlyList<MarkdownInline> Children)
    : MarkdownInline;