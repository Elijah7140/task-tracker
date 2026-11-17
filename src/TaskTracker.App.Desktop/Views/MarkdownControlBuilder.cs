using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Layout;
using Avalonia.Media;

using TaskTracker.Presentation.Markdown;

namespace TaskTracker.App.Desktop.Views;

/// <summary>
/// Turns the parsed Markdown blocks of §7.10 into ordinary Avalonia controls. Nothing here loads an image or
/// interprets HTML: the blocks only ever hold text, and a link is a button that calls <paramref name="openLink"/>.
/// </summary>
internal sealed class MarkdownControlBuilder(Action<string> openLink)
{
    private const double BlockSpacing = 8;
    private const double ListIndent = 20;
    private const double LinkMaxWidth = 260;
    private const double TaskBoxTemplateOffset = 6;
    private static readonly double[] HeadingSizes = [22, 19, 17, 15, 14, 14];

    /// <summary>Builds the controls for a block list, stacked with a little space between them.</summary>
    public StackPanel BuildBlocks(IReadOnlyList<MarkdownBlock> blocks)
    {
        var stack = new StackPanel { Spacing = BlockSpacing };

        foreach (var block in blocks)
        {
            stack.Children.Add(BuildBlock(block));
        }

        return stack;
    }

    private Control BuildBlock(MarkdownBlock block)
    {
        return block switch
        {
            MarkdownHeading heading => BuildHeading(heading),
            MarkdownParagraph paragraph => BuildText(paragraph.Inlines),
            MarkdownCodeBlock code => BuildCodeBlock(code),
            MarkdownQuote quote => BuildQuote(quote),
            MarkdownList list => BuildList(list),
            MarkdownRule => BuildRule(),
            _ => new Border()
        };
    }

    private TextBlock BuildHeading(MarkdownHeading heading)
    {
        var text = BuildText(heading.Inlines);
        text.FontWeight = FontWeight.Bold;
        text.FontSize = HeadingSizes[Math.Clamp(heading.Level, 1, HeadingSizes.Length) - 1];
        return text;
    }

    /// <summary>
    /// A code block wraps long lines. The preview sits in a narrow details pane, where a horizontal scroller
    /// hid the end of a line and its auto-hiding scroll bar looked like an underline.
    /// </summary>
    private static Border BuildCodeBlock(MarkdownCodeBlock code)
    {
        var text = new TextBlock
        {
            Text = code.Text,
            FontFamily = CodeFont(),
            TextWrapping = TextWrapping.Wrap
        };

        return new Border { Classes = { "mdCode" }, Child = text };
    }

    private Border BuildQuote(MarkdownQuote quote)
    {
        return new Border { Classes = { "mdQuote" }, Child = BuildBlocks(quote.Blocks) };
    }

    private static Border BuildRule()
    {
        return new Border { Classes = { "mdRule" } };
    }

    private StackPanel BuildList(MarkdownList list)
    {
        var stack = new StackPanel { Spacing = 4 };

        for (var index = 0; index < list.Items.Count; index++)
        {
            stack.Children.Add(BuildListItem(list, list.Items[index], index));
        }

        return stack;
    }

    private Grid BuildListItem(MarkdownList list, MarkdownListItem item, int index)
    {
        var row = new Grid { ColumnDefinitions = new ColumnDefinitions($"{ListIndent},*") };
        var marker = BuildMarker(list, item, index);
        var content = BuildBlocks(item.Blocks);
        Grid.SetColumn(content, 1);
        row.Children.Add(marker);
        row.Children.Add(content);
        return row;
    }

    private static Control BuildMarker(MarkdownList list, MarkdownListItem item, int index)
    {
        if (item.IsChecked is bool isChecked)
        {
            return BuildTaskCheckBox(isChecked);
        }

        var label = list.IsOrdered ? $"{list.StartNumber + index}." : "•";

        return new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Top };
    }

    /// <summary>
    /// A task-list box is display only: it cannot take focus or be clicked. The Fluent template draws its
    /// 20-pixel box <see cref="TaskBoxTemplateOffset"/> pixels down inside a fixed 32-pixel row. Negative top and
    /// bottom margins of that size keep the whole template (so nothing is clipped) but take up only the box's
    /// height, which lines the box up with the first line of text.
    /// </summary>
    private static CheckBox BuildTaskCheckBox(bool isChecked)
    {
        var box = new CheckBox
        {
            IsChecked = isChecked,
            IsHitTestVisible = false,
            Focusable = false,
            MinWidth = 0,
            MinHeight = 0,
            Padding = new Thickness(0),
            Margin = new Thickness(0, -TaskBoxTemplateOffset, 0, -TaskBoxTemplateOffset),
            VerticalAlignment = VerticalAlignment.Top,
            HorizontalAlignment = HorizontalAlignment.Left
        };
        AutomationProperties.SetAutomationId(box, "MarkdownTaskCheckBox");
        return box;
    }

    private TextBlock BuildText(IReadOnlyList<MarkdownInline> inlines)
    {
        var text = new TextBlock { TextWrapping = TextWrapping.Wrap };
        AddInlines(text.Inlines!, inlines);
        return text;
    }

    private void AddInlines(InlineCollection target, IReadOnlyList<MarkdownInline> inlines)
    {
        foreach (var inline in inlines)
        {
            target.Add(BuildInline(inline));
        }
    }

    private Inline BuildInline(MarkdownInline inline)
    {
        return inline switch
        {
            MarkdownText text => new Run(text.Text),
            MarkdownLineBreak => new LineBreak(),
            MarkdownCode code => BuildInlineCode(code),
            MarkdownEmphasis emphasis => BuildEmphasis(emphasis),
            MarkdownLink link => BuildLink(link),
            _ => new Run()
        };
    }

    private static Run BuildInlineCode(MarkdownCode code)
    {
        return new Run(code.Text)
        {
            FontFamily = CodeFont(),
            Background = new SolidColorBrush(Color.FromArgb(40, 128, 128, 128))
        };
    }

    private Span BuildEmphasis(MarkdownEmphasis emphasis)
    {
        var span = new Span();

        if (emphasis.IsStrong)
        {
            span.FontWeight = FontWeight.Bold;
        }
        else
        {
            span.FontStyle = FontStyle.Italic;
        }

        AddInlines(span.Inlines, emphasis.Children);
        return span;
    }

    private Inline BuildLink(MarkdownLink link)
    {
        if (!link.IsOpenable)
        {
            return BuildBlockedLink(link);
        }

        var button = new Button
        {
            Classes = { "mdLink" },
            Content = new TextBlock
            {
                Text = PlainText(link.Children),
                TextTrimming = TextTrimming.CharacterEllipsis,
                TextDecorations = TextDecorations.Underline
            },
            MaxWidth = LinkMaxWidth
        };
        AutomationProperties.SetAutomationId(button, "MarkdownLink");
        AutomationProperties.SetName(button, PlainText(link.Children));
        ToolTip.SetTip(button, link.Url);
        button.Click += (_, _) => openLink(link.Url);
        return new InlineUIContainer(button);
    }

    /// <summary>A link with a scheme the app never launches: its text and address are shown, not clickable.</summary>
    private static Span BuildBlockedLink(MarkdownLink link)
    {
        var span = new Span();
        span.Inlines.Add(new Run(PlainText(link.Children)));
        span.Inlines.Add(new Run($" ({link.Url})") { FontStyle = FontStyle.Italic, Foreground = Brushes.Gray });
        return span;
    }

    private static string PlainText(IReadOnlyList<MarkdownInline> inlines)
    {
        var parts = new List<string>();

        foreach (var inline in inlines)
        {
            parts.Add(InlineText(inline));
        }

        return string.Concat(parts);
    }

    private static string InlineText(MarkdownInline inline)
    {
        return inline switch
        {
            MarkdownText text => text.Text,
            MarkdownCode code => code.Text,
            MarkdownLineBreak => " ",
            MarkdownEmphasis emphasis => PlainText(emphasis.Children),
            MarkdownLink link => PlainText(link.Children),
            _ => string.Empty
        };
    }

    /// <summary>
    /// A monospace font on each OS. Linux needs named fonts (DejaVu, Liberation, Noto): the generic
    /// "monospace" name is not resolved there and would fall back to a proportional font.
    /// </summary>
    private static FontFamily CodeFont()
    {
        return new FontFamily("Cascadia Mono, Consolas, Menlo, DejaVu Sans Mono, Liberation Mono, Noto Sans Mono, monospace");
    }
}