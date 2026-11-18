using System.Globalization;

namespace TaskTracker.Core.Settings;

/// <summary>Stores a whole number within an inclusive range as invariant text.</summary>
public sealed class WholeNumberCodec : ISettingCodec<int>
{
    private readonly int minimum;
    private readonly int maximum;

    public WholeNumberCodec(int minimum, int maximum)
    {
        if (minimum > maximum)
        {
            throw new ArgumentException("The minimum must not exceed the maximum.", nameof(minimum));
        }

        this.minimum = minimum;
        this.maximum = maximum;
    }

    public int Parse(string text)
    {
        if (!int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out var value) ||
            value < minimum || value > maximum)
        {
            throw new FormatException($"Expected a whole number from {minimum} to {maximum}.");
        }

        return value;
    }

    public string Format(int value)
    {
        return value.ToString(CultureInfo.InvariantCulture);
    }
}