namespace TaskTracker.Core.Search;

/// <summary>Keys reserved for searchable item columns.</summary>
public static class BuiltInSearchKeys
{
    public static IReadOnlyList<string> All { get; } =
    [
        "title", "ticket", "type", "priority", "due", "scheduled", "status"
    ];
}