using TaskTracker.Core.Transfer.Csv;

namespace TaskTracker.Core.Tests.Transfer.Csv;

public sealed class CsvCellsTests
{
    [Theory]
    [InlineData("=SUM(A1:A9)", "'=SUM(A1:A9)")]
    [InlineData("+1", "'+1")]
    [InlineData("-5", "'-5")]
    [InlineData("@cmd", "'@cmd")]
    [InlineData("\tindented", "'\tindented")]
    [InlineData("\rreturn", "'\rreturn")]
    [InlineData("'=already quoted by the user", "''=already quoted by the user")]
    public void Text_that_starts_like_a_formula_gets_a_leading_apostrophe(string text, string expected)
    {
        Assert.Equal(expected, CsvCells.Protect(text));
    }

    [Theory]
    [InlineData("")]
    [InlineData("plain")]
    [InlineData("a=b")]
    [InlineData("'plain apostrophe")]
    [InlineData("'")]
    [InlineData(" =leading space is not a formula start")]
    public void Other_text_is_left_alone(string text)
    {
        Assert.Equal(text, CsvCells.Protect(text));
        Assert.Equal(text, CsvCells.Unprotect(text));
    }

    [Theory]
    [InlineData("'=SUM(A1:A9)", "=SUM(A1:A9)")]
    [InlineData("'+1", "+1")]
    [InlineData("'-5", "-5")]
    [InlineData("'@cmd", "@cmd")]
    [InlineData("''=x", "'=x")]
    public void One_apostrophe_in_front_of_a_formula_start_is_removed(string cell, string expected)
    {
        Assert.Equal(expected, CsvCells.Unprotect(cell));
    }

    [Theory]
    [InlineData("=1+1")]
    [InlineData("'=1+1")]
    [InlineData("''=1+1")]
    [InlineData("-")]
    [InlineData("@home")]
    [InlineData("'quoted text")]
    [InlineData("\t")]
    public void Protecting_then_unprotecting_gives_the_original_text(string text)
    {
        Assert.Equal(text, CsvCells.Unprotect(CsvCells.Protect(text)));
    }

    [Theory]
    [InlineData("Title", "Title (field)")]
    [InlineData("type", "type (field)")]
    [InlineData("Due date", "Due date (field)")]
    [InlineData("Severity", "Severity")]
    public void A_custom_field_header_that_equals_a_fixed_header_is_suffixed(string displayName, string expected)
    {
        Assert.Equal(expected, CsvColumns.FieldHeader(displayName));
    }
}