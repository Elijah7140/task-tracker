namespace TaskTracker.Core.Lookups;

/// <summary>A priority level whose list order determines its rank.</summary>
public sealed class PriorityLevel : LookupEntity
{
    private PriorityLevel()
    {
    }

    public static PriorityLevel Create(string name, int sortOrder = 0)
    {
        var value = new PriorityLevel
        {
            Id = Guid.CreateVersion7(),
            SortOrder = sortOrder
        };

        value.Rename(name);
        return value;
    }

    internal static PriorityLevel BuiltIn(Guid id, string name, int order)
    {
        return new PriorityLevel
        {
            Id = id,
            Name = name,
            SortOrder = order,
            IsBuiltIn = true
        };
    }
}