namespace TaskTracker.Core.Lookups;

/// <summary>Stable identifiers and definitions for seeded lookup rows.</summary>
public static class BuiltInLookups
{
    public static readonly Guid ChangeId = Guid.Parse("019a0000-0000-7000-8000-000000000001");

    public static readonly Guid ErrorId = Guid.Parse("019a0000-0000-7000-8000-000000000002");

    public static readonly Guid DiscussionId = Guid.Parse("019a0000-0000-7000-8000-000000000003");

    public static readonly Guid CriticalId = Guid.Parse("019a0000-0000-7000-8000-000000000101");

    public static readonly Guid HighId = Guid.Parse("019a0000-0000-7000-8000-000000000102");

    public static readonly Guid MediumId = Guid.Parse("019a0000-0000-7000-8000-000000000103");

    public static readonly Guid LowId = Guid.Parse("019a0000-0000-7000-8000-000000000104");

    public static IReadOnlyList<ItemType> ItemTypes =>
    [
        ItemType.BuiltIn(ChangeId, "Change", 0),
        ItemType.BuiltIn(ErrorId, "Error", 1),
        ItemType.BuiltIn(DiscussionId, "Discussion", 2)
    ];

    public static IReadOnlyList<PriorityLevel> PriorityLevels =>
    [
        PriorityLevel.BuiltIn(CriticalId, "Critical", 0),
        PriorityLevel.BuiltIn(HighId, "High", 1),
        PriorityLevel.BuiltIn(MediumId, "Medium", 2),
        PriorityLevel.BuiltIn(LowId, "Low", 3)
    ];
}