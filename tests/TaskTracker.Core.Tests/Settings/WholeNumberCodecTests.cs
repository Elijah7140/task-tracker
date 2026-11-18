using TaskTracker.Core.Settings;

namespace TaskTracker.Core.Tests.Settings;

public sealed class WholeNumberCodecTests
{
    [Fact]
    public void Values_round_trip_as_invariant_text()
    {
        var codec = new WholeNumberCodec(1, 8);

        var text = codec.Format(6);

        Assert.Equal("6", text);
        Assert.Equal(6, codec.Parse(text));
    }

    [Theory]
    [InlineData("0")]
    [InlineData("9")]
    [InlineData("-1")]
    [InlineData("4.5")]
    [InlineData("four")]
    [InlineData("")]
    public void Text_outside_the_range_or_not_a_whole_number_is_rejected(string text)
    {
        var codec = new WholeNumberCodec(1, 8);

        Assert.Throws<FormatException>(() => codec.Parse(text));
    }
}