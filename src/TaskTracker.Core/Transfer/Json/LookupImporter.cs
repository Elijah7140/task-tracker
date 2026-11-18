using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// Matches the file's item types, priority levels and statuses to existing ones by name (ignoring
/// case) and creates the missing ones after the existing lists.
/// </summary>
internal static class LookupImporter
{
    public static async Task ImportAsync(
        IUnitOfWork work, ExportDocument document, ImportMap map, IssueList issues, CancellationToken cancellationToken)
    {
        var types = await work.Lookups.ItemTypesAsync(cancellationToken);
        var priorities = await work.Lookups.PriorityLevelsAsync(cancellationToken);

        ImportItemTypes(work, document.ItemTypes.OrEmpty(), types.ToList(), map);
        ImportPriorityLevels(work, document.PriorityLevels.OrEmpty(), priorities.ToList(), map, issues);
        var statuses = await work.Lookups.StatusesAsync(cancellationToken);
        ImportStatuses(work, document.Statuses.OrEmpty(), statuses.ToList(), map, issues);
    }

    private static void ImportItemTypes(
        IUnitOfWork work, IReadOnlyList<LookupDocument> documents, List<ItemType> known, ImportMap map)
    {
        var nextOrder = known.Count == 0 ? 0 : known.Max(type => type.SortOrder) + 1;

        foreach (var document in documents.OrderBy(lookup => lookup.SortOrder ?? 0))
        {
            var match = known.FirstOrDefault(type => SameName(type.Name, document.Name));

            if (match is null)
            {
                match = CreateItemType(document, nextOrder++);
                work.Lookups.Add(match);
                known.Add(match);
            }

            map.ItemTypes[document.Id!.Value] = match.Id;
        }
    }

    private static ItemType CreateItemType(LookupDocument document, int sortOrder)
    {
        var type = ItemType.Create(document.Name!, sortOrder);
        type.SetColorKey(document.ColorKey);
        type.SetIconKey(document.IconKey);

        if (document.IsArchived == true)
        {
            type.Archive();
        }

        return type;
    }

    private static void ImportPriorityLevels(
        IUnitOfWork work, IReadOnlyList<LookupDocument> documents, List<PriorityLevel> known, ImportMap map, IssueList issues)
    {
        var byId = known.ToDictionary(level => level.Id);
        var reserved = documents.Select(document => document.Id!.Value).Where(byId.ContainsKey).ToHashSet();
        var nextOrder = known.Select(level => level.SortOrder).DefaultIfEmpty(-1).Max() + 1;

        foreach (var (document, index) in Ordered(documents))
        {
            var match = FindPriorityMatch(document, known, byId, reserved);

            if (match is null)
            {
                match = CreatePriorityLevel(document, nextOrder++);
                if (IsNumberTaken(known, match))
                {
                    issues.Add($"$.priorityLevels[{index}].number", "This priority number is already in use.");
                    continue;
                }

                work.Lookups.Add(match);
                known.Add(match);
            }

            reserved.Add(match.Id);
            map.PriorityLevels[document.Id!.Value] = match.Id;
        }
    }

    private static PriorityLevel? FindPriorityMatch(LookupDocument document, List<PriorityLevel> known,
        Dictionary<Guid, PriorityLevel> byId, HashSet<Guid> reserved)
    {
        if (byId.TryGetValue(document.Id!.Value, out var exact))
        {
            return exact;
        }

        if (!string.IsNullOrWhiteSpace(document.Name))
        {
            return known.FirstOrDefault(level => SameName(level.Name, document.Name));
        }

        var archived = document.IsArchived == true;
        return known.Where(level => level.Name.Length == 0 && level.Number == document.Number
                && level.IsArchived == archived && (!archived || !reserved.Contains(level.Id)))
            .OrderBy(level => level.SortOrder).ThenBy(level => level.Id).FirstOrDefault();
    }

    private static bool IsNumberTaken(IEnumerable<PriorityLevel> known, PriorityLevel level)
    {
        if (level.IsArchived || level.Number is null)
        {
            return false;
        }

        return known.Any(other => !other.IsArchived && other.Number == level.Number);
    }

    private static PriorityLevel CreatePriorityLevel(LookupDocument document, int sortOrder)
    {
        var level = PriorityLevel.Create(document.Name ?? string.Empty, sortOrder, document.Number);
        level.SetColorKey(document.ColorKey);

        if (document.IsArchived == true)
        {
            level.Archive();
        }

        return level;
    }

    private static void ImportStatuses(IUnitOfWork work, IReadOnlyList<LookupDocument> documents,
        List<StatusLevel> known, ImportMap map, IssueList issues)
    {
        var nextOrder = known.Select(status => status.SortOrder).DefaultIfEmpty(-1).Max() + 1;
        foreach (var (document, index) in Ordered(documents))
        {
            var kind = LookupValidator.ReadStatusKind(document.Kind)!.Value;
            var status = known.FirstOrDefault(row => SameName(row.Name, document.Name));
            if (status is null)
            {
                status = CreateStatus(document, kind, nextOrder++);
                work.Lookups.Add(status);
                known.Add(status);
            }
            else if (status.Kind != kind)
            {
                issues.Add($"$.statuses[{index}].kind", "The matching status has a different kind.");
            }

            map.Statuses[document.Id!.Value] = status.Id;
        }

        map.FirstDoneStatusId = StatusLevel.FirstDone(known);
    }

    private static StatusLevel CreateStatus(LookupDocument document, StatusKind kind, int sortOrder)
    {
        var status = StatusLevel.Create(document.Name!, kind, sortOrder);

        if (document.IsArchived == true)
        {
            status.Archive();
        }

        return status;
    }

    /// <summary>The documents in list order, each with its position in the file for issue paths.</summary>
    private static IEnumerable<(LookupDocument Document, int Index)> Ordered(IReadOnlyList<LookupDocument> documents)
    {
        var positioned = documents.Select((document, index) => (document, index));
        return positioned.OrderBy(entry => entry.document.SortOrder ?? 0);
    }

    private static bool SameName(string existing, string? imported)
    {
        return LookupEntity.NameComparer.Equals(existing, imported?.Trim());
    }
}