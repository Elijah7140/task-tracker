using Markdig.Extensions.TaskLists;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace TaskTracker.Presentation.Markdown;

/// <summary>Copies Markdig blocks into the display model, enforcing the nesting and block limits.</summary>
internal sealed class MarkdownBlockMapper
{
    private readonly MarkdownInlineMapper inlines = new();
    private int blockCount;

    /// <summary>True once the block limit stopped the mapping early.</summary>
    public bool IsTruncated { get; private set; }

    public List<MarkdownBlock> MapChildren(ContainerBlock container, int depth)
    {
        var blocks = new List<MarkdownBlock>();

        foreach (var child in container)
        {
            if (blockCount >= MarkdownParser.MaxBlocks)
            {
                IsTruncated = true;
                break;
            }

            blockCount++;
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
            HeadingBlock heading => new MarkdownHeading(heading.Level, inlines.Map(heading.Inline)),
            ParagraphBlock paragraph => new MarkdownParagraph(inlines.Map(paragraph.Inline)),
            CodeBlock code => new MarkdownCodeBlock(code.Lines.ToString()),
            ThematicBreakBlock => new MarkdownRule(),
            HtmlBlock html => new MarkdownParagraph([new MarkdownText(html.Lines.ToString())]),
            LinkReferenceDefinitionGroup => null,
            ContainerBlock container => MapContainer(container, depth),
            _ => null
        };
    }

    private MarkdownBlock? MapContainer(ContainerBlock container, int depth)
    {
        if (depth >= MarkdownParser.MaxNesting)
        {
            return new MarkdownCodeBlock(FlattenToText(container));
        }

        return container switch
        {
            QuoteBlock quote => new MarkdownQuote(MapChildren(quote, depth + 1)),
            ListBlock list => MapList(list, depth),
            _ => null
        };
    }

    private MarkdownList MapList(ListBlock list, int depth)
    {
        var items = new List<MarkdownListItem>();

        foreach (var entry in list.OfType<ListItemBlock>())
        {
            items.Add(new MarkdownListItem(MapChildren(entry, depth + 1), ReadTaskState(entry)));
        }

        return new MarkdownList(list.IsOrdered, ReadStartNumber(list), items);
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