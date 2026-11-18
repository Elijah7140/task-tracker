using System.Globalization;

using TaskTracker.Core.Lookups;

namespace TaskTracker.Core.Transfer.Csv;

/// <summary>Explicit references in new exports and name or display-label matching for legacy cells.</summary>
internal static class CsvPriorityReference
{
    private const string NamePrefix = "#name:";
    private const string IdPrefix = "#id:";

    public static string Write(PriorityLevel? level)
    {
        if (level is null)
        {
            return string.Empty;
        }

        if (level.Name.Length == 0)
        {
            return level.IsArchived ? $"{IdPrefix}{level.Id:D}" : $"#{level.Number!.Value.ToString(CultureInfo.InvariantCulture)}";
        }

        return NamePrefix + level.Name;
    }

    public static IReadOnlyList<PriorityLevel> Match(string cell, IReadOnlyList<PriorityLevel> levels)
    {
        if (cell.StartsWith(NamePrefix, StringComparison.OrdinalIgnoreCase))
        {
            return levels.Where(level => Same(level.Name, cell[NamePrefix.Length..]) && level.Name.Length > 0).ToList();
        }

        if (cell.StartsWith(IdPrefix, StringComparison.OrdinalIgnoreCase)
            && Guid.TryParseExact(cell[IdPrefix.Length..], "D", out var id))
        {
            return levels.Where(level => level.Id == id).ToList();
        }

        if (cell.StartsWith('#') && TryNumber(cell[1..], out var number))
        {
            return levels.Where(level => !level.IsArchived && level.Number == number).ToList();
        }

        return [];
    }

    public static IReadOnlyList<PriorityLevel> MatchLegacy(string cell, IReadOnlyList<PriorityLevel> levels)
    {
        return levels.Where(level => Same(level.Name, cell) || Same(level.Label, cell)).ToList();
    }

    private static bool TryNumber(string text, out int number)
    {
        return int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out number) && number > 0;
    }

    private static bool Same(string left, string right)
    {
        return string.Equals(left, right, StringComparison.OrdinalIgnoreCase);
    }
}