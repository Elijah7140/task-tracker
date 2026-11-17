using Markdig;

namespace TaskTracker.Presentation.Markdown;

/// <summary>
/// Turns a description into the display model of §7.10. Markdig does the parsing; this class and its two mappers
/// copy only the supported elements into the plain records of this folder, so the view never sees a parser type.
/// Raw HTML is switched off in the parser and so arrives as literal text, and an image becomes a link to its address.
/// Size limits keep a huge or deeply nested description from freezing or crashing the preview.
/// </summary>
public static class MarkdownParser
{
    /// <summary>Text beyond this many characters is not previewed.</summary>
    public const int MaxSourceLength = 100_000;

    /// <summary>Containers (quotes, lists, emphasis) nested deeper than this are shown as plain text.</summary>
    public const int MaxNesting = 16;

    /// <summary>The maximum number of blocks, list entries and inline nodes in a preview.</summary>
    public const int MaxNodes = 2_000;

    /// <summary>The maximum length of preview text after counted link addresses and labels are expanded.</summary>
    public const int MaxDisplayTextLength = MaxSourceLength;

    /// <summary>The line added after a preview that was cut short.</summary>
    public const string TruncationNotice = "(The preview was shortened because the description is very long.)";

    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .DisableHtml()
        .UseTaskLists()
        .UseAutoLinks()
        .Build();

    /// <summary>Parses a description; blank text gives no blocks. Never throws for any input.</summary>
    public static IReadOnlyList<MarkdownBlock> Parse(string? source)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return [];
        }

        var isCut = source.Length > MaxSourceLength;
        var text = isCut ? source[..MaxSourceLength] : source;

        try
        {
            return ParseText(text, isCut);
        }
        catch (ArgumentException)
        {
            // Markdig refuses input nested beyond its own depth limit; show such text as it was written.
            return isCut ? [new MarkdownCodeBlock(text), TruncationParagraph()] : [new MarkdownCodeBlock(text)];
        }
    }

    private static List<MarkdownBlock> ParseText(string text, bool isCut)
    {
        var document = Markdig.Markdown.Parse(text, Pipeline);
        var budget = new MarkdownDisplayBudget();
        var mapper = new MarkdownBlockMapper(budget);
        var blocks = mapper.MapChildren(document, 0);

        if (isCut || budget.IsTruncated)
        {
            blocks.Add(TruncationParagraph());
        }

        return blocks;
    }

    private static MarkdownParagraph TruncationParagraph()
    {
        return new MarkdownParagraph([new MarkdownText(TruncationNotice)]);
    }
}