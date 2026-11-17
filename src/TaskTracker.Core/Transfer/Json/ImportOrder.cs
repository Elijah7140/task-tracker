namespace TaskTracker.Core.Transfer.Json;

/// <summary>Puts the documents of a list into the order their sort orders ask for.</summary>
internal static class ImportOrder
{
    /// <summary>
    /// The positions of the documents in sort-order order; documents with the same (or no) sort order keep their
    /// order in the file. The positions are kept so issues can still name the document by its place in the file.
    /// </summary>
    public static IEnumerable<int> Positions<T>(IReadOnlyList<T> documents, Func<T, int?> sortOrderOf)
    {
        var positions = Enumerable.Range(0, documents.Count);

        return positions.OrderBy(position => sortOrderOf(documents[position]) ?? 0);
    }
}