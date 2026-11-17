namespace TaskTracker.Core.Search;

/// <summary>Keys reserved for searchable item columns and for the text query syntax.</summary>
public static class BuiltInSearchKeys
{
    public static IReadOnlyList<string> All { get; } =
    [
        "title", "ticket", "type", "priority", "due", "scheduled", "status"
    ];

    /// <summary>Words the text syntax gives a meaning of their own (<c>has:</c>, <c>no:</c>, <c>is:</c>).</summary>
    public static IReadOnlyList<string> QueryKeywords { get; } = ["has", "no", "is"];

    /// <summary>Every key a new custom field must avoid: the built-in columns plus the syntax keywords.</summary>
    public static IReadOnlyList<string> Reserved { get; } = [.. All, .. QueryKeywords];
}