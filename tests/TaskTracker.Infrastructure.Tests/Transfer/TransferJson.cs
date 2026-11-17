using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace TaskTracker.Infrastructure.Tests.Transfer;

/// <summary>Helpers for reading, editing and comparing exported JSON in tests.</summary>
internal static partial class TransferJson
{
    public static JsonObject Parse(string json)
    {
        return JsonNode.Parse(json)!.AsObject();
    }

    /// <summary>Applies an edit to the parsed document and returns the changed JSON text.</summary>
    public static string Edit(string json, Action<JsonObject> edit)
    {
        var document = Parse(json);
        edit(document);

        return document.ToJsonString();
    }

    /// <summary>The project object with this name.</summary>
    public static JsonObject Project(JsonObject document, string name)
    {
        return document["projects"]!.AsArray().Select(node => node!.AsObject())
            .Single(project => project["name"]!.GetValue<string>() == name);
    }

    /// <summary>The item object with this title anywhere in the document.</summary>
    public static JsonObject Item(JsonObject document, string title)
    {
        return document["projects"]!.AsArray()
            .SelectMany(project => project!["items"]!.AsArray())
            .Select(node => node!.AsObject())
            .Single(item => item["title"]!.GetValue<string>() == title);
    }

    public static int ItemIndex(JsonObject document, string projectName, string title)
    {
        var items = Project(document, projectName)["items"]!.AsArray();

        return items.ToList().FindIndex(node => node!["title"]!.GetValue<string>() == title);
    }

    public static int ProjectIndex(JsonObject document, string name)
    {
        return document["projects"]!.AsArray().ToList().FindIndex(node => node!["name"]!.GetValue<string>() == name);
    }

    /// <summary>
    /// The JSON with every guid replaced by a number in order of first appearance and the export
    /// time removed, so two exports of equal data compare equal even though the ids differ.
    /// </summary>
    public static string WithoutIds(string json)
    {
        var document = Parse(json);
        document.Remove("exportedAtUtc");
        var numbers = new Dictionary<string, string>();

        return GuidPattern().Replace(document.ToJsonString(), match =>
        {
            if (!numbers.TryGetValue(match.Value, out var number))
            {
                number = $"id{numbers.Count}";
                numbers[match.Value] = number;
            }

            return number;
        });
    }

    [GeneratedRegex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")]
    private static partial Regex GuidPattern();
}