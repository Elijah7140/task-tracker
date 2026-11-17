using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>The JSON settings shared by export and import: camelCase, indented, nulls omitted, text kept readable.</summary>
internal static class ExportJson
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false) }
    };

    public static string Serialize(ExportDocument document)
    {
        return JsonSerializer.Serialize(document, Options);
    }

    public static ExportDocument? Deserialize(string json)
    {
        return JsonSerializer.Deserialize<ExportDocument>(json, Options);
    }

    /// <summary>Reads the options the importer uses to peek at the version before a full read.</summary>
    public static JsonDocumentOptions DocumentOptions { get; } = new()
    {
        AllowTrailingCommas = true,
        CommentHandling = JsonCommentHandling.Skip
    };
}