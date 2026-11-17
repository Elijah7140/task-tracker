namespace TaskTracker.Core.Search.Syntax;

/// <summary>Finds the known key closest to a mistyped one.</summary>
internal static class QueryKeySuggester
{
    private const int MaxDistance = 2;

    /// <summary>Returns the nearest candidate within two edits, or null when nothing is close.</summary>
    public static string? Suggest(string input, IEnumerable<string> candidates)
    {
        var lowered = input.ToLowerInvariant();
        string? best = null;
        var bestDistance = MaxDistance + 1;

        foreach (var candidate in candidates)
        {
            var distance = EditDistance(lowered, candidate);

            if (distance < bestDistance)
            {
                best = candidate;
                bestDistance = distance;
            }
        }

        return best;
    }

    /// <summary>The Levenshtein distance: single-character inserts, deletes and replacements.</summary>
    private static int EditDistance(string first, string second)
    {
        var previous = Enumerable.Range(0, second.Length + 1).ToArray();

        for (var row = 1; row <= first.Length; row++)
        {
            var current = new int[second.Length + 1];
            current[0] = row;

            for (var column = 1; column <= second.Length; column++)
            {
                var replace = previous[column - 1] + (first[row - 1] == second[column - 1] ? 0 : 1);
                var insertOrDelete = Math.Min(previous[column], current[column - 1]) + 1;
                current[column] = Math.Min(replace, insertOrDelete);
            }

            previous = current;
        }

        return previous[second.Length];
    }
}