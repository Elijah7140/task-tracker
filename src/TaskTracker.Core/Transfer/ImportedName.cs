namespace TaskTracker.Core.Transfer;

/// <summary>Picks a name that does not clash with existing ones by adding " (imported)", " (imported 2)" and so on.</summary>
internal static class ImportedName
{
    /// <summary>Returns <paramref name="name"/> if it is free (ignoring case), otherwise the first free suffixed name.</summary>
    public static string Unique(string name, Func<string, bool> isTaken, int maxLength)
    {
        var trimmed = name.Trim();

        if (!isTaken(trimmed))
        {
            return trimmed;
        }

        for (var attempt = 1; ; attempt++)
        {
            var suffix = attempt == 1 ? " (imported)" : $" (imported {attempt})";
            var candidate = Shorten(trimmed, maxLength - suffix.Length) + suffix;

            if (!isTaken(candidate))
            {
                return candidate;
            }
        }
    }

    private static string Shorten(string name, int length)
    {
        return name.Length <= length ? name : name[..length].TrimEnd();
    }
}