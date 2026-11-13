namespace TaskTracker.Core.Settings;

/// <summary>Stores Boolean settings as lowercase invariant text.</summary>
public sealed class BoolCodec : ISettingCodec<bool>
{
    public bool Parse(string text)
    {
        if (!bool.TryParse(text, out var value))
        {
            throw new FormatException("Expected a Boolean setting value.");
        }

        return value;
    }

    public string Format(bool value)
    {
        return value ? "true" : "false";
    }
}