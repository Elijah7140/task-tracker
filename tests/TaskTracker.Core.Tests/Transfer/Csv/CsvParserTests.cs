using TaskTracker.Core.Transfer.Csv;

namespace TaskTracker.Core.Tests.Transfer.Csv;

public sealed class CsvParserTests
{
    [Fact]
    public void Records_may_end_with_crlf_lf_or_cr()
    {
        var table = CsvParser.Parse("a,b\r\nc,d\ne,f\rg,h");

        Assert.Equal(4, table.Records.Count);
        Assert.Equal(["g", "h"], table.Records[3].Cells);
        Assert.Equal([1, 2, 3, 4], table.Records.Select(record => record.RowNumber));
    }

    [Fact]
    public void A_leading_byte_order_mark_is_ignored()
    {
        var table = CsvParser.Parse($"{(char)0xFEFF}Title,Ticket\r\nx,y\r\n");

        Assert.Equal(["Title", "Ticket"], table.Records[0].Cells);
    }

    [Fact]
    public void Quoted_cells_keep_commas_quotes_and_line_breaks()
    {
        var table = CsvParser.Parse("\"a,b\",\"say \"\"hi\"\"\",\"one\r\ntwo\"\r\n");

        var record = Assert.Single(table.Records);
        Assert.Equal(["a,b", "say \"hi\"", "one\r\ntwo"], record.Cells);
    }

    [Fact]
    public void Spaces_around_cells_are_kept_and_empty_cells_stay_empty()
    {
        var table = CsvParser.Parse(" a ,,\" b \"\r\n");

        Assert.Equal([" a ", string.Empty, " b "], Assert.Single(table.Records).Cells);
    }

    [Fact]
    public void Blank_lines_are_skipped_but_still_count_as_rows()
    {
        var table = CsvParser.Parse("a\r\n\r\nb\r\n");

        Assert.Equal([1, 3], table.Records.Select(record => record.RowNumber));
    }

    [Fact]
    public void A_trailing_comma_makes_a_final_empty_cell()
    {
        var table = CsvParser.Parse("a,b,\r\n");

        Assert.Equal(["a", "b", string.Empty], Assert.Single(table.Records).Cells);
    }

    [Fact]
    public void An_unclosed_quote_is_reported_with_its_row()
    {
        var table = CsvParser.Parse("a,b\r\nc,\"never closed\r\n");

        var issue = Assert.Single(table.Issues);
        Assert.Equal("Row 2", issue.Path);
    }

    [Fact]
    public void Text_after_a_closing_quote_is_reported()
    {
        var table = CsvParser.Parse("\"a\"x,b\r\n");

        var issue = Assert.Single(table.Issues);
        Assert.Equal("Row 1", issue.Path);
        Assert.Equal(["a", "b"], Assert.Single(table.Records).Cells);
    }

    [Fact]
    public void Empty_text_has_no_records()
    {
        var table = CsvParser.Parse(string.Empty);

        Assert.Empty(table.Records);
        Assert.Empty(table.Issues);
    }
}