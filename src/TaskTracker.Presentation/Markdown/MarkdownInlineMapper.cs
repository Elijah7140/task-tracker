using System.Text;

using Markdig.Extensions.TaskLists;
using Markdig.Syntax.Inlines;

using TaskTracker.Core.Items;

namespace TaskTracker.Presentation.Markdown;

/// <summary>Copies Markdig inline content into the display model, enforcing the nesting limit.</summary>
internal sealed class MarkdownInlineMapper
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
            result.Add(new MarkdownText(PlainText(container)));
            return result;
        }

        for (var child = container.FirstChild; child is not null; child = child.NextSibling)
        {
            AddInline(result, child, depth);
        }

        return result;
    }

    private void AddInline(List<MarkdownInline> result, Inline inline, int depth)
    {
        switch (inline)
        {
            case LiteralInline literal:
                result.Add(new MarkdownText(literal.Content.ToString()));
                break;
            case LineBreakInline:
                result.Add(new MarkdownLineBreak());
                break;
            case CodeInline code:
                result.Add(new MarkdownCode(code.Content));
                break;
            case EmphasisInline emphasis:
                result.Add(new MarkdownEmphasis(emphasis.DelimiterCount >= 2, Map(emphasis, depth + 1)));
                break;
            case LinkInline link:
                result.Add(MapLink(link, depth));
                break;
            case AutolinkInline autolink:
                result.Add(MapAutolink(autolink));
                break;
            case HtmlEntityInline entity:
                result.Add(new MarkdownText(entity.Transcoded.ToString()));
                break;
            case HtmlInline html:
                result.Add(new MarkdownText(html.Tag));
                break;
            case TaskList:
                break;
            case ContainerInline container:
                result.AddRange(Map(container, depth + 1));
                break;
        }
    }

    private MarkdownLink MapLink(LinkInline link, int depth)
    {
        var url = link.Url ?? string.Empty;
        var isOpenable = LinkPolicy.IsOpenable(url);

        if (link.IsImage)
        {
            return new MarkdownLink(url, isOpenable, true, [new MarkdownText(ImageText(link))]);
        }

        var children = Map(link, depth + 1);

        if (children.Count == 0)
        {
            children.Add(new MarkdownText(url));
        }

        return new MarkdownLink(url, isOpenable, false, children);
    }

    /// <summary>An image is never loaded; its alt text stands in for it, or a generic word when there is none.</summary>
    private static string ImageText(LinkInline image)
    {
        var alt = PlainText(image);
        return alt.Length == 0 ? UnnamedImageText : alt;
    }

    private static MarkdownLink MapAutolink(AutolinkInline autolink)
    {
        var shown = autolink.Url;
        var url = autolink.IsEmail ? "mailto:" + shown : shown;

        return new MarkdownLink(url, LinkPolicy.IsOpenable(url), false, [new MarkdownText(shown)]);
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