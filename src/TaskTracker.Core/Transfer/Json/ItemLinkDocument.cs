namespace TaskTracker.Core.Transfer.Json;

/// <summary>One link of an item (§7.10). The position in the item's <c>links</c> list is its order.</summary>
public sealed class ItemLinkDocument
{
    public string? Url { get; init; }

    public string? Title { get; init; }
}