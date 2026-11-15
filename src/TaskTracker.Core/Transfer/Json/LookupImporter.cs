using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// Matches the file's item types and priority levels to existing ones by name (ignoring case)
/// and creates the missing ones after the existing lists.
/// </summary>
internal static class LookupImporter
{
    public static async Task ImportAsync(
        IUnitOfWork work, ExportDocument document, ImportMap map, CancellationToken cancellationToken)
    {
        var types = await work.Lookups.ItemTypesAsync(cancellationToken);
        var priorities = await work.Lookups.PriorityLevelsAsync(cancellationToken);

        ImportItemTypes(work, document.ItemTypes.OrEmpty(), types.ToList(), map);
        ImportPriorityLevels(work, document.PriorityLevels.OrEmpty(), priorities.ToList(), map);
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
        IUnitOfWork work, IReadOnlyList<LookupDocument> documents, List<PriorityLevel> known, ImportMap map)
    {
        var nextOrder = known.Count == 0 ? 0 : known.Max(level => level.SortOrder) + 1;

        foreach (var document in documents.OrderBy(lookup => lookup.SortOrder ?? 0))
        {
            var match = known.FirstOrDefault(level => SameName(level.Name, document.Name));

            if (match is null)
            {
                match = CreatePriorityLevel(document, nextOrder++);
                work.Lookups.Add(match);
                known.Add(match);
            }

            map.PriorityLevels[document.Id!.Value] = match.Id;
        }
    }

    private static PriorityLevel CreatePriorityLevel(LookupDocument document, int sortOrder)
    {
        var level = PriorityLevel.Create(document.Name!, sortOrder);
        level.SetColorKey(document.ColorKey);

        if (document.IsArchived == true)
        {
            level.Archive();
        }

        return level;
    }

    private static bool SameName(string existing, string? imported)
    {
        return string.Equals(existing, imported?.Trim(), StringComparison.OrdinalIgnoreCase);
    }
}