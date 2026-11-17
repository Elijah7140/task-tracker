using System.Text.Json;
using System.Text.Json.Serialization;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Reads defined recurrence names and allows comma-separated names for weekday flags.</summary>
internal sealed class RecurrenceEnumConverter<TEnum> : JsonConverter<TEnum> where TEnum : struct, Enum
{
    private static readonly HashSet<string> DefinedNames = new(Enum.GetNames<TEnum>(), StringComparer.OrdinalIgnoreCase);
    private static readonly bool IsFlags = typeof(TEnum).IsDefined(typeof(FlagsAttribute), inherit: false);
    private static readonly JsonConverter<TEnum> Writer = (JsonConverter<TEnum>)
        new JsonStringEnumConverter<TEnum>(JsonNamingPolicy.CamelCase, allowIntegerValues: false)
            .CreateConverter(typeof(TEnum), new JsonSerializerOptions());

    public override TEnum Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String && reader.GetString() is { } text &&
            HasDefinedNames(text) && Enum.TryParse<TEnum>(text, ignoreCase: true, out var value))
        {
            return value;
        }

        throw new JsonException(IsFlags
            ? "Enter a comma-separated list of valid weekday names."
            : "Enter a single valid recurrence name.");
    }

    public override void Write(Utf8JsonWriter writer, TEnum value, JsonSerializerOptions options)
    {
        Writer.Write(writer, value, options);
    }

    private static bool HasDefinedNames(string text)
    {
        return IsFlags
            ? text.Split(',', StringSplitOptions.TrimEntries).All(DefinedNames.Contains)
            : DefinedNames.Contains(text.Trim());
    }
}