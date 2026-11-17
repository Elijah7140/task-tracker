using System.Text;

using Markdig.Syntax.Inlines;

using TaskTracker.Core.Items;

namespace TaskTracker.Presentation.Markdown;

/// <summary>Copies Markdig inline content into the display model, enforcing the nesting limit.</summary>
internal sealed class MarkdownInlineMapper(MarkdownDisplayBudget budget)
{
    private const string UnnamedImageText = "image";

    public List<MarkdownInline> Map(ContainerInline? container, int depth = 0)
    {
        var result = new List<MarkdownInline>();

        if (container is null)
        {
            return result;
        }

        if (depth >= MarkdownParser.MaxNesting)
        {
            AddText(result, PlainText(container));
            return result;
        }

        for (var child = container.FirstChild; child is not null; child = child.NextSibling)
        {
            if (budget.IsTruncated)
            {
                break;
            }

            AddInline(result, child, depth);
        }

        return result;
    }

    private void AddInline(List<MarkdownInline> result, Inline inline, int depth)
    {
        if (inline is ContainerInline container and not (EmphasisInline or LinkInline))
        {
            result.AddRange(Map(container, depth + 1));
            return;
        }

        var mapped = MapInline(inline, depth);

        if (mapped is not null)
        {
            result.Add(mapped);
        }
    }

    private MarkdownInline? MapInline(Inline inline, int depth)
    {
        if (!budget.TakeNode())
        {
            return null;
        }

        return inline switch
        {
            LiteralInline literal => MapText(literal.Content.ToString()),
            LineBreakInline => budget.TakeText(1) ? new MarkdownLineBreak() : null,
            CodeInline code => budget.TakeText(code.Content.Length) ? new MarkdownCode(code.Content) : null,
            EmphasisInline emphasis => MapEmphasis(emphasis, depth),
            LinkInline link => MapLink(link, depth),
            AutolinkInline autolink => MapAutolink(autolink),
            HtmlEntityInline entity => MapText(entity.Transcoded.ToString()),
            HtmlInline html => MapText(html.Tag),
            _ => null
        };
    }

    private MarkdownText? MapText(string text)
    {
        return budget.TakeText(text.Length) ? new MarkdownText(text) : null;
    }

    private void AddText(List<MarkdownInline> result, string text)
    {
        if (budget.TakeNode(text.Length))
        {
            result.Add(new MarkdownText(text));
        }
    }

    private MarkdownEmphasis? MapEmphasis(EmphasisInline emphasis, int depth)
    {
        var children = Map(emphasis, depth + 1);
        return budget.IsTruncated && children.Count == 0
            ? null
            : new MarkdownEmphasis(emphasis.DelimiterCount >= 2, children);
    }

    private bool TakeLinkAddress(string url, bool isOpenable)
    {
        // Blocked addresses are shown with a leading space and parentheses.
        return budget.TakeText(url.Length + (isOpenable ? 0 : 3));
    }

    private MarkdownLink? MapLink(LinkInline link, int depth)
    {
        var url = link.Url ?? string.Empty;
        var isOpenable = LinkPolicy.IsOpenable(url);

        if (!TakeLinkAddress(url, isOpenable))
        {
            return null;
        }

        var children = link.IsImage ? [] : Map(link, depth + 1);

        if (children.Count == 0)
        {
            AddText(children, link.IsImage ? ImageText(link) : url);
        }

        return children.Count == 0 ? null : new MarkdownLink(url, isOpenable, link.IsImage, children);
    }

    /// <summary>An image is never loaded; its alt text stands in for it, or a generic word when there is none.</summary>
    private static string ImageText(LinkInline image)
    {
        var alt = PlainText(image);
        return alt.Length == 0 ? UnnamedImageText : alt;
    }

    private MarkdownLink? MapAutolink(AutolinkInline autolink)
    {
        var shown = autolink.Url;
        var url = autolink.IsEmail ? "mailto:" + shown : shown;

        var isOpenable = LinkPolicy.IsOpenable(url);

        return TakeLinkAddress(url, isOpenable) && budget.TakeNode(shown.Length)
            ? new MarkdownLink(url, isOpenable, false, [new MarkdownText(shown)])
            : null;
    }

    /// <summary>The visible text of an inline tree without any formatting.</summary>
    internal static string PlainText(ContainerInline container)
    {
        var text = new StringBuilder();

        foreach (var inline in container.FindDescendants<Inline>())
        {
            if (inline is LiteralInline literal)
            {
                text.Append(literal.Content.ToString());
            }
            else if (inline is CodeInline code)
            {
                text.Append(code.Content);
            }
        }

        return text.ToString();
    }
}