using Markdig.Extensions.TaskLists;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace TaskTracker.Presentation.Markdown;

/// <summary>Copies Markdig blocks and list entries into the bounded display model.</summary>
internal sealed class MarkdownBlockMapper(MarkdownDisplayBudget budget)
{
    private readonly MarkdownInlineMapper inlines = new(budget);

    public List<MarkdownBlock> MapChildren(ContainerBlock container, int depth)
    {
        var blocks = new List<MarkdownBlock>();

        foreach (var child in container)
        {
            if (child is LinkReferenceDefinitionGroup)
            {
                continue;
            }

            if (!budget.TakeNode())
            {
                break;
            }

            var mapped = MapBlock(child, depth);

            if (mapped is not null)
            {
                blocks.Add(mapped);
            }
        }

        return blocks;
    }

    private MarkdownBlock? MapBlock(Block block, int depth)
    {
        return block switch
        {
            HeadingBlock or ParagraphBlock => MapInlineBlock((LeafBlock)block),
            CodeBlock code => MapCode(code.Lines.ToString()),
            ThematicBreakBlock => new MarkdownRule(),
            HtmlBlock html => MapHtml(html.Lines.ToString()),
            ContainerBlock container => MapContainer(container, depth),
            _ => null
        };
    }

    private MarkdownBlock? MapInlineBlock(LeafBlock block)
    {
        var children = inlines.Map(block.Inline);

        if (budget.IsTruncated && children.Count == 0)
        {
            return null;
        }

        return block is HeadingBlock heading
            ? new MarkdownHeading(heading.Level, children)
            : new MarkdownParagraph(children);
    }

    private MarkdownCodeBlock? MapCode(string text)
    {
        return budget.TakeText(text.Length) ? new MarkdownCodeBlock(text) : null;
    }

    private MarkdownParagraph? MapHtml(string text)
    {
        return budget.TakeNode(text.Length) ? new MarkdownParagraph([new MarkdownText(text)]) : null;
    }

    private MarkdownBlock? MapContainer(ContainerBlock container, int depth)
    {
        if (depth >= MarkdownParser.MaxNesting)
        {
            return MapCode(FlattenToText(container));
        }

        return container switch
        {
            QuoteBlock quote => MapQuote(quote, depth),
            ListBlock list => MapList(list, depth),
            _ => null
        };
    }

    private MarkdownQuote? MapQuote(QuoteBlock quote, int depth)
    {
        var children = MapChildren(quote, depth + 1);
        return budget.IsTruncated && children.Count == 0 ? null : new MarkdownQuote(children);
    }

    private MarkdownList? MapList(ListBlock list, int depth)
    {
        var items = new List<MarkdownListItem>();

        foreach (var entry in list.OfType<ListItemBlock>())
        {
            if (!budget.TakeNode())
            {
                break;
            }

            var children = MapChildren(entry, depth + 1);

            if (budget.IsTruncated && children.Count == 0)
            {
                break;
            }

            items.Add(new MarkdownListItem(children, ReadTaskState(entry)));
        }

        return budget.IsTruncated && items.Count == 0
            ? null
            : new MarkdownList(list.IsOrdered, ReadStartNumber(list), items);
    }

    private static int ReadStartNumber(ListBlock list)
    {
        return int.TryParse(list.OrderedStart, out var start) ? start : 1;
    }

    /// <summary>The checked state of a task-list entry, or null when the entry does not start with a checkbox.</summary>
    private static bool? ReadTaskState(ListItemBlock entry)
    {
        var firstInline = (entry.FirstOrDefault() as ParagraphBlock)?.Inline?.FirstChild;

        if (firstInline is TaskList task)
        {
            return task.Checked;
        }

        return null;
    }

    private static string FlattenToText(ContainerBlock container)
    {
        var lines = new List<string>();

        foreach (var leaf in container.Descendants<LeafBlock>())
        {
            lines.Add(leaf.Inline is null ? leaf.Lines.ToString() : MarkdownInlineMapper.PlainText(leaf.Inline));
        }

        return string.Join("\n", lines);
    }
}