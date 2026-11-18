namespace TaskTracker.Core.Lookups;

/// <summary>An editable workflow status with a fixed completion kind.</summary>
public sealed class StatusLevel : LookupEntity
{
    private StatusLevel()
    {
    }

    /// <summary>Whether items with this status are open or completed. Fixed when the status is added.</summary>
    public StatusKind Kind { get; private set; }

    public static StatusLevel Create(string name, StatusKind kind, int sortOrder = 0)
    {
        return Create(Guid.CreateVersion7(), name, kind, sortOrder);
    }

    internal static StatusLevel Create(Guid id, string name, StatusKind kind, int sortOrder)
    {
        if (!Enum.IsDefined(kind))
        {
            throw new DomainRuleException("Choose an Open or Done status kind.");
        }

        var status = new StatusLevel
        {
            Id = id,
            Kind = kind,
            SortOrder = sortOrder
        };
        status.Rename(name);
        return status;
    }

    /// <summary>The Done status that completing an item sets: the first active one in list order.</summary>
    internal static Guid FirstDone(IEnumerable<StatusLevel> statuses)
    {
        var active = statuses.Where(status => status.Kind == StatusKind.Done && !status.IsArchived);
        return active.OrderBy(status => status.SortOrder).ThenBy(status => status.Id).First().Id;
    }
}