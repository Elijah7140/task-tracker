namespace TaskTracker.Core.Settings;

/// <summary>Converts one setting type to and from invariant storage text.</summary>
public interface ISettingCodec<T>
{
    T Parse(string text);

    string Format(T value);
}