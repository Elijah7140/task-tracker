namespace TaskTracker.Core.Settings;

/// <summary>A typed setting with an explicit invariant text codec.</summary>
public sealed class SettingDefinition<T>
{
    private readonly ISettingCodec<T> codec;

    public SettingDefinition(string key, T defaultValue, bool projectOverridable, ISettingCodec<T> codec)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new ArgumentException("Setting key is required.", nameof(key));
        }

        this.codec = codec ?? throw new ArgumentNullException(nameof(codec));
        Key = key;
        DefaultValue = defaultValue;
        ProjectOverridable = projectOverridable;
    }

    public string Key { get; }

    public T DefaultValue { get; }

    public bool ProjectOverridable { get; }

    public T Parse(string text)
    {
        try
        {
            return codec.Parse(text);
        }
        catch (FormatException exception)
        {
            throw new FormatException($"Invalid value for setting '{Key}': {exception.Message}", exception);
        }
    }

    public string Format(T value)
    {
        return codec.Format(value);
    }
}