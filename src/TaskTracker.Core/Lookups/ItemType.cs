namespace TaskTracker.Core.Lookups;

/// <summary>A user-extensible item type.</summary>
public sealed class ItemType : LookupEntity
{
    private ItemType()
    {
    }

    public string? IconKey { get; private set; }

    public static ItemType Create(string name, int sortOrder = 0)
    {
        var value = new ItemType
        {
            Id = Guid.CreateVersion7(),
            SortOrder = sortOrder
        };

        value.Rename(name);
        return value;
    }

    public void SetIconKey(string? key)
    {
        IconKey = key;
    }

    internal static ItemType BuiltIn(Guid id, string name, int order)
    {
        return new ItemType
        {
            Id = id,
            Name = name,
            SortOrder = order,
            IsBuiltIn = true
        };
    }
}