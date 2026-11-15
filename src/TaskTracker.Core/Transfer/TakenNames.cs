namespace TaskTracker.Core.Transfer;

/// <summary>The names already in use (ignoring case); hands out a free variant of each imported name.</summary>
internal sealed class TakenNames(IEnumerable<string> existing, int maxLength)
{
    private readonly HashSet<string> names = new(existing, StringComparer.OrdinalIgnoreCase);

    /// <summary>Returns the name itself when free, otherwise "name (imported)", "name (imported 2)" and so on; reserves the result.</summary>
    public string Reserve(string name)
    {
        var unique = ImportedName.Unique(name, names.Contains, maxLength);
        names.Add(unique);

        return unique;
    }
}