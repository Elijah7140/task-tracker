namespace TaskTracker.Core.Search;

/// <summary>A selectable choice for a search filter.</summary>
public sealed record SearchChoice(Guid Id, string Label, int SortOrder)
{
    /// <summary>A priority level's name when its <see cref="Label"/> also shows its number.</summary>
    public string? Name { get; init; }

    /// <summary>A priority level's number, which <c>priority:7</c> matches first (§7.15).</summary>
    public int? Number { get; init; }
}