using System.Text;

namespace TaskTracker.Core.Fields;

/// <summary>A global or project-specific custom field.</summary>
public sealed class FieldDefinition
{
    private FieldDefinition()
    {
    }

    public Guid Id { get; private set; }

    public string Key { get; private set; } = string.Empty;

    public string DisplayName { get; private set; } = string.Empty;

    public FieldDataType DataType { get; private set; }

    public Guid? ProjectId { get; private set; }

    public bool IsArchived { get; private set; }

    public int SortOrder { get; private set; }

    public static FieldDefinition Create(string name, FieldDataType type, Guid? projectId,
        int sortOrder, IEnumerable<string> existingKeys)
    {
        var displayName = NormalizeName(name);
        var key = UniqueKey(Slug(displayName), existingKeys);

        return new FieldDefinition
        {
            Id = Guid.CreateVersion7(),
            Key = key,
            DisplayName = displayName,
            DataType = type,
            ProjectId = projectId,
            SortOrder = sortOrder
        };
    }

    private static string UniqueKey(string slug, IEnumerable<string> existingKeys)
    {
        var keys = existingKeys.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var suffix = 1;

        while (true)
        {
            var ending = suffix == 1 ? string.Empty : $"-{suffix}";
            var prefix = slug[..Math.Min(slug.Length, 300 - ending.Length)];
            var key = prefix + ending;

            if (!keys.Contains(key))
            {
                return key;
            }

            suffix++;
        }
    }

    public void Rename(string name)
    {
        DisplayName = NormalizeName(name);
    }

    public void ChangeType(FieldDataType type, bool hasValues)
    {
        if (hasValues && type != DataType)
        {
            throw new DomainRuleException("A field with values cannot change type.");
        }

        DataType = type;
    }

    public void Archive()
    {
        IsArchived = true;
    }

    public void Unarchive()
    {
        IsArchived = false;
    }

    public void Reorder(int order)
    {
        SortOrder = order;
    }

    private static string NormalizeName(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 300)
        {
            throw new DomainRuleException("Field name must be 1 to 300 characters.");
        }

        return name.Trim();
    }

    private static string Slug(string name)
    {
        var result = new StringBuilder();

        foreach (var character in name.ToLowerInvariant())
        {
            if (char.IsAsciiLetterOrDigit(character))
            {
                result.Append(character);
            }
            else if (result.Length > 0 && result[^1] != '-')
            {
                result.Append('-');
            }
        }

        var slug = result.ToString().TrimEnd('-');
        return slug.Length == 0 ? "field" : slug;
    }
}