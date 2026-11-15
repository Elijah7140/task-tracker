using TaskTracker.Core.Transfer.Csv;

namespace TaskTracker.Core.Tests.Transfer.Csv;

public sealed class CsvWriterTests
{
    [Fact]
    public void Plain_cells_are_written_unquoted_with_crlf_line_ends()
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "Title", "Ticket" }, new[] { "Write report", "JIRA-1" } };

        var text = CsvWriter.Write(rows);

        Assert.Equal("Title,Ticket\r\nWrite report,JIRA-1\r\n", text);
    }

    [Theory]
    [InlineData("a,b", "\"a,b\"")]
    [InlineData("say \"hi\"", "\"say \"\"hi\"\"\"")]
    [InlineData("line one\nline two", "\"line one\nline two\"")]
    [InlineData("line one\r\nline two", "\"line one\r\nline two\"")]
    [InlineData("carriage\rreturn", "\"carriage\rreturn\"")]
    [InlineData(" leading", "\" leading\"")]
    [InlineData("trailing ", "\"trailing \"")]
    [InlineData("\ttabbed", "\"\ttabbed\"")]
    public void Cells_with_special_characters_or_edge_whitespace_are_quoted(string cell, string expected)
    {
        Assert.Equal(expected, CsvWriter.Escape(cell));
    }

    [Fact]
    public void Empty_and_inner_space_cells_are_left_alone()
    {
        Assert.Equal(string.Empty, CsvWriter.Escape(string.Empty));
        Assert.Equal("two words", CsvWriter.Escape("two words"));
    }

    [Fact]
    public void Written_text_reads_back_to_the_same_cells()
    {
        var cells = new[] { "a,b", "say \"hi\"", "two\r\nlines", " padded ", string.Empty, "plain" };

        var table = CsvParser.Parse(CsvWriter.Write([cells]));

        var record = Assert.Single(table.Records);
        Assert.Equal(cells, record.Cells);
        Assert.Empty(table.Issues);
    }
}