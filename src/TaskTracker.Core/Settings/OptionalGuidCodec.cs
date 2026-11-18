namespace TaskTracker.Core.Settings;

/// <summary>Stores an optional identifier as its invariant text, or an empty string when there is none.</summary>
public sealed class OptionalGuidCodec : ISettingCodec<Guid?>
{
    public Guid? Parse(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        if (!Guid.TryParse(text, out var value))
        {
            throw new FormatException("Expected an identifier setting value.");
        }

        return value;
    }

    public string Format(Guid? value)
    {
        return value?.ToString("D") ?? string.Empty;
    }
}