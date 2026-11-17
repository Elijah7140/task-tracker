namespace TaskTracker.Core.Lookups;

/// <summary>Shared editable fields for item types and priority levels.</summary>
public abstract class LookupEntity
{
    /// <summary>The longest name an item type or priority level may have, once trimmed.</summary>
    public const int NameMaxLength = 300;

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
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > NameMaxLength)
        {
            throw new DomainRuleException($"Name must be 1 to {NameMaxLength} characters.");
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
            throw new DomainRuleException("Built-in item types cannot be archived.");
        }

        IsArchived = true;
    }

    public void Unarchive()
    {
        IsArchived = false;
    }
}