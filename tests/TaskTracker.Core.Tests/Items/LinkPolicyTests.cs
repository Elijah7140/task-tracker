using TaskTracker.Core.Items;

namespace TaskTracker.Core.Tests.Items;

public sealed class LinkPolicyTests
{
    [Theory]
    [InlineData("https://example.com")]
    [InlineData("http://example.com/path?x=1#top")]
    [InlineData("HTTPS://EXAMPLE.COM")]
    [InlineData("mailto:team@example.com")]
    [InlineData("  https://example.com  ")]
    public void Web_and_mail_addresses_are_openable(string url)
    {
        Assert.True(LinkPolicy.IsOpenable(url));
        Assert.Null(LinkPolicy.Validate(url, null));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("example.com")]
    [InlineData("/relative")]
    [InlineData("https://")]
    [InlineData("file:///C:/secrets.txt")]
    [InlineData("file://server/share")]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:text/html,hi")]
    [InlineData("ftp://example.com")]
    [InlineData("ssh://example.com")]
    [InlineData("tel:+123")]
    [InlineData("myapp://open")]
    public void Everything_else_is_not_openable(string? url)
    {
        Assert.False(LinkPolicy.IsOpenable(url));
        Assert.NotNull(LinkPolicy.Validate(url, null));
    }

    [Fact]
    public void Spaces_inside_an_address_are_refused()
    {
        Assert.Equal("A link address cannot contain spaces; write a space as %20.",
            LinkPolicy.Validate("https://example.com/a b", null));
    }

    [Fact]
    public void Length_limits_apply_after_trimming()
    {
        var atLimit = "https://e.com/" + new string('a', LinkPolicy.UrlMaxLength - 14);
        var titleAtLimit = new string('t', LinkPolicy.TitleMaxLength);

        Assert.Null(LinkPolicy.Validate(atLimit, titleAtLimit));
        Assert.Null(LinkPolicy.Validate("  " + atLimit + "  ", "  " + titleAtLimit + "  "));
        Assert.NotNull(LinkPolicy.Validate(atLimit + "a", null));
        Assert.NotNull(LinkPolicy.Validate("https://example.com", titleAtLimit + "t"));
    }

    [Fact]
    public void Blank_titles_become_null_and_others_are_trimmed()
    {
        Assert.Null(LinkPolicy.NormalizeTitle("  "));
        Assert.Null(LinkPolicy.NormalizeTitle(null));
        Assert.Equal("Spec", LinkPolicy.NormalizeTitle("  Spec "));
    }

    [Fact]
    public void A_parsed_address_is_returned_for_openable_text_only()
    {
        Assert.True(LinkPolicy.TryCreateUri("https://example.com/x", out var uri));
        Assert.Equal("example.com", uri.Host);
        Assert.False(LinkPolicy.TryCreateUri("file:///x", out _));
    }
}