using TaskTracker.Core.Lookups;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Checks the item type or priority level list of an import document.</summary>
internal static class LookupValidator
{
    public static void Validate(IReadOnlyList<LookupDocument>? lookups, string path, IssueList issues)
    {
        var ids = new HashSet<Guid>();
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var list = lookups.OrEmpty();

        for (var position = 0; position < list.Count; position++)
        {
            var itemPath = ImportChecks.Element(path, position);
            ImportChecks.CheckId(list[position].Id, $"{itemPath}.id", ids, issues);
            CheckName(list[position].Name, $"{itemPath}.name", names, issues);
        }
    }

    private static void CheckName(string? name, string path, HashSet<string> names, IssueList issues)
    {
        if (ImportChecks.CheckName(name, LookupEntity.NameMaxLength, path, issues) && !names.Add(name!.Trim()))
        {
            issues.Add(path, $"The name '{name.Trim()}' is used more than once.");
        }
    }
}