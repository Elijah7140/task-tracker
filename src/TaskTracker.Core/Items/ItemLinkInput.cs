namespace TaskTracker.Core.Items;

/// <summary>One link of an item as the editor holds it; a null <paramref name="Id"/> is a link not saved yet.</summary>
public sealed record ItemLinkInput(Guid? Id, string Url, string? Title);