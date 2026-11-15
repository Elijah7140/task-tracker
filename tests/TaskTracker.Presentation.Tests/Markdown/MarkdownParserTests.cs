using TaskTracker.Presentation.Markdown;

namespace TaskTracker.Presentation.Tests.Markdown;

public sealed class MarkdownParserTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   \n ")]
    public void Blank_text_gives_no_blocks(string? source)
    {
        Assert.Empty(MarkdownParser.Parse(source));
    }

    [Fact]
    public void Plain_text_is_one_paragraph()
    {
        var blocks = MarkdownParser.Parse("Just some words");

        var paragraph = Assert.IsType<MarkdownParagraph>(Assert.Single(blocks));
        Assert.Equal([new MarkdownText("Just some words")], paragraph.Inlines);
    }

    [Fact]
    public void Single_newlines_stay_line_breaks_so_old_plain_text_looks_the_same()
    {
        var paragraph = Assert.IsType<MarkdownParagraph>(Assert.Single(MarkdownParser.Parse("one\ntwo")));

        Assert.Equal([new MarkdownText("one"), new MarkdownLineBreak(), new MarkdownText("two")], paragraph.Inlines);
    }

    [Theory]
    [InlineData("# Title", 1)]
    [InlineData("### Third", 3)]
    [InlineData("###### Sixth", 6)]
    public void Headings_keep_their_level(string source, int level)
    {
        var heading = Assert.IsType<MarkdownHeading>(Assert.Single(MarkdownParser.Parse(source)));

        Assert.Equal(level, heading.Level);
    }

    [Fact]
    public void Emphasis_inline_code_and_strong_text_are_mapped()
    {
        var paragraph = Assert.IsType<MarkdownParagraph>(Assert.Single(MarkdownParser.Parse("*soft* **hard** `code`")));

        var soft = Assert.IsType<MarkdownEmphasis>(paragraph.Inlines[0]);
        Assert.False(soft.IsStrong);
        Assert.Equal([new MarkdownText("soft")], soft.Children);
        var hard = Assert.IsType<MarkdownEmphasis>(paragraph.Inlines[2]);
        Assert.True(hard.IsStrong);
        Assert.Equal([new MarkdownText("hard")], hard.Children);
        Assert.Equal(new MarkdownCode("code"), paragraph.Inlines[4]);
    }

    [Fact]
    public void Fenced_code_keeps_its_text_verbatim()
    {
        var code = Assert.IsType<MarkdownCodeBlock>(Assert.Single(MarkdownParser.Parse("```sql\nSELECT *\n  FROM t;\n```")));

        Assert.Equal("SELECT *\n  FROM t;", code.Text);
    }

    [Fact]
    public void Indented_code_is_a_code_block()
    {
        var blocks = MarkdownParser.Parse("text\n\n    indented()");

        Assert.IsType<MarkdownCodeBlock>(blocks[1]);
    }

    [Fact]
    public void Bullet_lists_hold_one_item_per_entry()
    {
        var list = Assert.IsType<MarkdownList>(Assert.Single(MarkdownParser.Parse("- a\n- b")));

        Assert.False(list.IsOrdered);
        Assert.Equal(2, list.Items.Count);
        Assert.All(list.Items, item => Assert.Null(item.IsChecked));
    }

    [Fact]
    public void Numbered_lists_remember_their_start_number()
    {
        var list = Assert.IsType<MarkdownList>(Assert.Single(MarkdownParser.Parse("3. three\n4. four")));

        Assert.True(list.IsOrdered);
        Assert.Equal(3, list.StartNumber);
    }

    [Fact]
    public void Nested_lists_become_blocks_inside_the_item()
    {
        var list = Assert.IsType<MarkdownList>(Assert.Single(MarkdownParser.Parse("- outer\n  - inner")));

        var item = Assert.Single(list.Items);
        Assert.IsType<MarkdownParagraph>(item.Blocks[0]);
        Assert.IsType<MarkdownList>(item.Blocks[1]);
    }

    [Fact]
    public void Task_list_entries_carry_their_checked_state_without_the_marker_text()
    {
        var list = Assert.IsType<MarkdownList>(Assert.Single(MarkdownParser.Parse("- [x] done\n- [ ] todo")));

        Assert.Equal([true, false], list.Items.Select(item => item.IsChecked));
        var first = Assert.IsType<MarkdownParagraph>(list.Items[0].Blocks[0]);
        Assert.Equal("done", string.Concat(first.Inlines.OfType<MarkdownText>().Select(text => text.Text)).Trim());
    }

    [Fact]
    public void Block_quotes_hold_blocks()
    {
        var quote = Assert.IsType<MarkdownQuote>(Assert.Single(MarkdownParser.Parse("> quoted\n>\n> more")));

        Assert.Equal(2, quote.Blocks.Count);
    }

    [Fact]
    public void Horizontal_rules_are_mapped()
    {
        var blocks = MarkdownParser.Parse("above\n\n---\n\nbelow");

        Assert.IsType<MarkdownRule>(blocks[1]);
    }

    [Theory]
    [InlineData("[docs](https://example.com/a)", "https://example.com/a")]
    [InlineData("[plain](http://example.com)", "http://example.com")]
    [InlineData("[mail](mailto:a@example.com)", "mailto:a@example.com")]
    public void Links_with_allowed_schemes_are_openable(string source, string url)
    {
        var link = FirstLink(source);

        Assert.True(link.IsOpenable);
        Assert.Equal(url, link.Url);
    }

    [Theory]
    [InlineData("[x](file:///C:/secrets.txt)")]
    [InlineData("[x](javascript:alert(1))")]
    [InlineData("[x](ftp://example.com/a)")]
    [InlineData("[x](myapp://open)")]
    [InlineData("[x](/relative/path)")]
    [InlineData("[x]()")]
    public void Links_with_other_schemes_are_shown_but_not_openable(string source)
    {
        Assert.False(FirstLink(source).IsOpenable);
    }

    [Fact]
    public void Bare_web_addresses_become_links()
    {
        var link = FirstLink("see https://example.com/page now");

        Assert.True(link.IsOpenable);
        Assert.Equal("https://example.com/page", link.Url);
    }

    [Fact]
    public void Angle_bracket_addresses_become_links()
    {
        var link = FirstLink("<https://example.com>");

        Assert.Equal("https://example.com", link.Url);
        Assert.True(link.IsOpenable);
    }

    [Fact]
    public void Images_are_never_loaded_and_show_their_alt_text_as_a_link()
    {
        var link = FirstLink("![the diagram](https://example.com/d.png)");

        Assert.True(link.IsImage);
        Assert.Equal([new MarkdownText("the diagram")], link.Children);
        Assert.Equal("https://example.com/d.png", link.Url);
    }

    [Fact]
    public void An_image_without_alt_text_is_called_image()
    {
        var link = FirstLink("![](https://example.com/d.png)");

        Assert.Equal([new MarkdownText("image")], link.Children);
    }

    [Fact]
    public void An_image_with_a_blocked_scheme_is_not_openable()
    {
        Assert.False(FirstLink("![x](file:///etc/passwd)").IsOpenable);
    }

    [Theory]
    [InlineData("<script>alert(1)</script>", "<script>alert(1)</script>")]
    [InlineData("a <b>bold</b> b", "a <b>bold</b> b")]
    public void Raw_html_is_shown_as_literal_text(string source, string expected)
    {
        var blocks = MarkdownParser.Parse(source);

        Assert.Equal(expected, VisibleText(blocks));
    }

    [Fact]
    public void An_html_block_is_shown_as_literal_text_not_as_a_link_or_element()
    {
        var blocks = MarkdownParser.Parse("<div onclick=\"x()\">\n<a href=\"https://evil.example\">go</a>\n</div>");

        Assert.All(blocks, block => Assert.IsType<MarkdownParagraph>(block));
        Assert.DoesNotContain(AllInlines(blocks), inline => inline is MarkdownLink);
        Assert.Contains("<a href=\"https://evil.example\">go</a>", VisibleText(blocks));
    }

    [Fact]
    public void A_huge_description_is_cut_with_a_notice()
    {
        var blocks = MarkdownParser.Parse(new string('x', MarkdownParser.MaxSourceLength + 5000));

        var notice = Assert.IsType<MarkdownParagraph>(blocks[^1]);
        Assert.Equal([new MarkdownText(MarkdownParser.TruncationNotice)], notice.Inlines);
    }

    [Fact]
    public void Too_many_blocks_are_cut_with_a_notice()
    {
        var source = string.Join("\n\n", Enumerable.Range(0, MarkdownParser.MaxBlocks + 50).Select(number => $"p{number}"));

        var blocks = MarkdownParser.Parse(source);

        Assert.Equal(MarkdownParser.MaxBlocks + 1, blocks.Count);
    }

    [Fact]
    public void Deeply_nested_quotes_do_not_crash_and_flatten_to_text()
    {
        var blocks = MarkdownParser.Parse(new string('>', 5000) + " deep");

        Assert.NotEmpty(blocks);
        Assert.Contains("deep", FlattenedCode(blocks));
    }

    [Fact]
    public void Quotes_nested_beyond_the_display_limit_are_flattened_to_a_code_block()
    {
        var blocks = MarkdownParser.Parse(string.Concat(Enumerable.Repeat("> ", 40)) + "deep");

        Assert.Contains("deep", FlattenedCode(blocks));
    }

    [Fact]
    public void Deeply_nested_lists_do_not_crash()
    {
        var source = string.Concat(Enumerable.Range(0, 400).Select(depth => new string(' ', depth * 2) + "- item\n"));

        var blocks = MarkdownParser.Parse(source);

        Assert.NotEmpty(blocks);
    }

    [Fact]
    public void Deeply_nested_emphasis_and_brackets_do_not_crash()
    {
        var emphasis = string.Concat(Enumerable.Repeat("*a ", 3000)) + string.Concat(Enumerable.Repeat("* ", 3000));
        var brackets = string.Concat(Enumerable.Repeat("[", 3000)) + "x" + string.Concat(Enumerable.Repeat("](https://a.example)", 100));

        Assert.NotEmpty(MarkdownParser.Parse(emphasis));
        Assert.NotEmpty(MarkdownParser.Parse(brackets));
    }

    [Fact]
    public void Many_unclosed_markers_parse_in_reasonable_time()
    {
        var source = string.Concat(Enumerable.Repeat("`*_[<!", 15000));

        var watch = System.Diagnostics.Stopwatch.StartNew();
        MarkdownParser.Parse(source);

        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(10), $"took {watch.Elapsed}");
    }

    private static MarkdownLink FirstLink(string source)
    {
        return AllInlines(MarkdownParser.Parse(source)).OfType<MarkdownLink>().First();
    }

    private static IEnumerable<MarkdownInline> AllInlines(IEnumerable<MarkdownBlock> blocks)
    {
        foreach (var block in blocks)
        {
            foreach (var inline in InlinesOf(block))
            {
                yield return inline;
            }
        }
    }

    private static IEnumerable<MarkdownInline> InlinesOf(MarkdownBlock block)
    {
        return block switch
        {
            MarkdownParagraph paragraph => paragraph.Inlines,
            MarkdownHeading heading => heading.Inlines,
            MarkdownQuote quote => AllInlines(quote.Blocks),
            MarkdownList list => list.Items.SelectMany(item => AllInlines(item.Blocks)),
            _ => []
        };
    }

    private static string VisibleText(IEnumerable<MarkdownBlock> blocks)
    {
        return string.Concat(AllInlines(blocks).OfType<MarkdownText>().Select(text => text.Text));
    }

    private static string FlattenedCode(IEnumerable<MarkdownBlock> blocks)
    {
        var found = new List<string>();
        Collect(blocks, found);
        return string.Join("\n", found);
    }

    private static void Collect(IEnumerable<MarkdownBlock> blocks, List<string> found)
    {
        foreach (var block in blocks)
        {
            if (block is MarkdownCodeBlock code)
            {
                found.Add(code.Text);
            }
            else if (block is MarkdownQuote quote)
            {
                Collect(quote.Blocks, found);
            }
        }
    }
}