using TaskTracker.Core.Search;

namespace TaskTracker.Core.Tests.Search;

public sealed class FtsTermBuilderTests
{
    [Theory]
    [InlineData(null, null)]
    [InlineData("  \t ", null)]
    [InlineData("  alpha  beta ", "\"alpha\"* AND \"beta\"*")]
    [InlineData("a\"b", "\"a\"\"b\"*")]
    [InlineData("JIRA-1234", "\"JIRA-1234\"*")]
    [InlineData("* ( ) :", null)]
    public void User_text_becomes_quoted_prefix_phrases(string? input, string? expected)
    {
        var result = FtsTermBuilder.Build(input);

        Assert.Equal(expected, result);
    }
}