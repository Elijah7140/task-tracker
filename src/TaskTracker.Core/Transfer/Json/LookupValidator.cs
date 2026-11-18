using TaskTracker.Core.Lookups;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Checks the item type, priority level or status list of an import document.</summary>
internal static class LookupValidator
{
    /// <summary>Checks an item type list: unique ids and unique, valid names.</summary>
    public static void Validate(IReadOnlyList<LookupDocument>? lookups, string path, IssueList issues)
    {
        CheckIdsAndNames(lookups, path, issues, allowNumberOnly: false);
    }

    private static void CheckIdsAndNames(IReadOnlyList<LookupDocument>? lookups, string path, IssueList issues,
        bool allowNumberOnly)
    {
        var ids = new HashSet<Guid>();
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var list = lookups.OrEmpty();

        for (var position = 0; position < list.Count; position++)
        {
            var itemPath = ImportChecks.Element(path, position);
            ImportChecks.CheckId(list[position].Id, $"{itemPath}.id", ids, issues);
            if (!allowNumberOnly || !IsNumberOnly(list[position]))
            {
                CheckName(list[position].Name, $"{itemPath}.name", names, issues);
            }
        }
    }

    /// <summary>Checks a priority level list, including numbers that are positive and unique while active.</summary>
    public static void ValidatePriorityLevels(IReadOnlyList<LookupDocument>? levels, string path, IssueList issues)
    {
        CheckIdsAndNames(levels, path, issues, allowNumberOnly: true);
        var activeNumbers = new HashSet<int>();
        var list = levels.OrEmpty();

        for (var position = 0; position < list.Count; position++)
        {
            if (!IsValidNumber(list[position], activeNumbers))
            {
                var itemPath = ImportChecks.Element(path, position);
                issues.Add($"{itemPath}.number", "Expected a positive number unique among active priorities.");
            }
        }
    }

    /// <summary>Checks a status list, including each status's kind.</summary>
    public static void ValidateStatuses(IReadOnlyList<LookupDocument>? statuses, string path, IssueList issues)
    {
        CheckIdsAndNames(statuses, path, issues, allowNumberOnly: false);
        var list = statuses.OrEmpty();

        for (var position = 0; position < list.Count; position++)
        {
            if (ReadStatusKind(list[position].Kind) is null)
            {
                issues.Add($"{ImportChecks.Element(path, position)}.kind", "Expected 'open' or 'done'.");
            }
        }
    }

    /// <summary>Reads "open" or "done" in any case; null for anything else.</summary>
    internal static StatusKind? ReadStatusKind(string? kind)
    {
        return kind?.Trim().ToLowerInvariant() switch
        {
            "open" => StatusKind.Open,
            "done" => StatusKind.Done,
            _ => null
        };
    }

    /// <summary>A numbered priority level may leave its name empty.</summary>
    private static bool IsNumberOnly(LookupDocument lookup)
    {
        return lookup.Number is not null && string.IsNullOrWhiteSpace(lookup.Name);
    }

    private static bool IsValidNumber(LookupDocument level, HashSet<int> activeNumbers)
    {
        if (level.Number is not int number)
        {
            return true;
        }

        if (number < 1)
        {
            return false;
        }

        return level.IsArchived == true || activeNumbers.Add(number);
    }

    private static void CheckName(string? name, string path, HashSet<string> names, IssueList issues)
    {
        if (ImportChecks.CheckName(name, LookupEntity.NameMaxLength, path, issues) && !names.Add(name!.Trim()))
        {
            issues.Add(path, $"The name '{name.Trim()}' is used more than once.");
        }
    }
}