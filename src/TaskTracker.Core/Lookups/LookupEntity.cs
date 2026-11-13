namespace TaskTracker.Core.Lookups;

/// <summary>Shared editable fields for item types and priority levels.</summary>
public abstract class LookupEntity
{
    protected LookupEntity()
    {
    }

    public Guid Id { get; protected set; }

    public string Name { get; protected set; } = string.Empty;

    public string? ColorKey { get; protected set; }

    public bool IsBuiltIn { get; protected set; }

    public bool IsArchived { get; protected set; }

    public int SortOrder { get; protected set; }

    public void Rename(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 300)
        {
            throw new ArgumentException("Name must be 1 to 300 characters.", nameof(name));
        }

        Name = name.Trim();
    }

    public void SetColorKey(string? key)
    {
        ColorKey = key;
    }

    public void Reorder(int order)
    {
        SortOrder = order;
    }

    public void Archive()
    {
        if (this is ItemType && IsBuiltIn)
        {
            throw new InvalidOperationException("Built-in item types cannot be archived.");
        }

        IsArchived = true;
    }

    public void Unarchive()
    {
        IsArchived = false;
    }
}