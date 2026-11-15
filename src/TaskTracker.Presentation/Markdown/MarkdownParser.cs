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

    /// <summary>The preview stops after this many blocks.</summary>
    public const int MaxBlocks = 2_000;

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
            return [new MarkdownCodeBlock(text)];
        }
    }

    private static List<MarkdownBlock> ParseText(string text, bool isCut)
    {
        var document = Markdig.Markdown.Parse(text, Pipeline);
        var mapper = new MarkdownBlockMapper();
        var blocks = mapper.MapChildren(document, 0);

        if (isCut || mapper.IsTruncated)
        {
            blocks.Add(new MarkdownParagraph([new MarkdownText(TruncationNotice)]));
        }

        return blocks;
    }
}