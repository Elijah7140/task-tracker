using TaskTracker.Core.Fields;
using TaskTracker.Core.SavedSearches;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Small checks shared by the import validators; each one records an issue with its JSON path.</summary>
internal static class ImportChecks
{
    /// <summary>Checks that an id is present and not used before; remembers it in <paramref name="seen"/>.</summary>
    public static void CheckId(Guid? id, string path, HashSet<Guid> seen, IssueList issues)
    {
        if (id is null)
        {
            issues.Add(path, "An id is required.");
        }
        else if (!seen.Add(id.Value))
        {
            issues.Add(path, $"The id {id} is used more than once.");
        }
    }

    /// <summary>Checks a required name: not blank and at most <paramref name="maxLength"/> characters once trimmed.</summary>
    public static bool CheckName(string? value, int maxLength, string path, IssueList issues)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            issues.Add(path, "A value is required.");
            return false;
        }

        if (value.Trim().Length > maxLength)
        {
            issues.Add(path, $"The value must be {maxLength} characters or fewer.");
            return false;
        }

        return true;
    }

    /// <summary>Reads a field data type name such as <c>Choice</c>, ignoring case.</summary>
    public static bool TryParseDataType(string? text, out FieldDataType type)
    {
        foreach (var candidate in Enum.GetValues<FieldDataType>())
        {
            if (string.Equals(candidate.ToString(), text?.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                type = candidate;
                return true;
            }
        }

        type = default;
        return false;
    }

    /// <summary>Reads a saved search scope name (AllProjects, Project or Folder), ignoring case.</summary>
    public static bool TryParseScopeKind(string? text, out SavedSearchScopeKind kind)
    {
        foreach (var candidate in Enum.GetValues<SavedSearchScopeKind>())
        {
            if (string.Equals(candidate.ToString(), text?.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                kind = candidate;
                return true;
            }
        }

        kind = default;
        return false;
    }

    /// <summary>The path of an array element, for example <c>$.projects[2]</c>.</summary>
    public static string Element(string path, int index)
    {
        return $"{path}[{index}]";
    }

    /// <summary>A list that may be missing from the file, read as empty.</summary>
    public static IReadOnlyList<T> OrEmpty<T>(this IReadOnlyList<T>? list)
    {
        return list ?? [];
    }
}