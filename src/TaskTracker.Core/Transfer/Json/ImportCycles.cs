namespace TaskTracker.Core.Transfer.Json;

/// <summary>Finds documents that would end up inside themselves through their parent links.</summary>
internal static class ImportCycles
{
    /// <summary>True when following parent links from <paramref name="document"/> leads back to it or round in a loop.</summary>
    public static bool FormsCycle<T>(
        T document, Dictionary<Guid, T> byId, Func<T, Guid?> idOf, Func<T, Guid?> parentOf)
    {
        var seen = new HashSet<Guid>();
        var current = document;

        while (parentOf(current) is Guid parentId && byId.TryGetValue(parentId, out var parent))
        {
            if (idOf(parent) == idOf(document) || !seen.Add(parentId))
            {
                return true;
            }

            current = parent;
        }

        return false;
    }
}