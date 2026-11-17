using System.Text;

namespace TaskTracker.Core.Search.Syntax;

/// <summary>Renames field references in saved query text while preserving free text and clause values.</summary>
public static class QueryFieldKeyRewriter
{
    /// <summary>Rewrites only clauses recognized by the query scanner.</summary>
    public static string Rename(string queryText, string oldKey, string newKey)
    {
        var clauses = new QueryScanner(queryText).Scan().Clauses;
        StringBuilder? rewritten = null;

        for (var index = clauses.Count - 1; index >= 0; index--)
        {
            var clause = clauses[index];
            var reference = FindReference(clause, oldKey);

            if (reference is { } span)
            {
                rewritten ??= new StringBuilder(queryText);
                rewritten.Remove(span.Start, span.Length);
                rewritten.Insert(span.Start, newKey);
            }
        }

        return rewritten?.ToString() ?? queryText;
    }

    private static (int Start, int Length)? FindReference(QueryClause clause, string oldKey)
    {
        if (clause.Key.Equals(oldKey, StringComparison.OrdinalIgnoreCase))
        {
            return (clause.Start, clause.Key.Length);
        }

        var isPresence = clause.Symbol == ":" && (clause.Key.Equals("has", StringComparison.OrdinalIgnoreCase)
            || clause.Key.Equals("no", StringComparison.OrdinalIgnoreCase));

        if (isPresence && clause.Endpoints.Count == 1
            && clause.Endpoints[0].Value.Trim().Equals(oldKey, StringComparison.OrdinalIgnoreCase))
        {
            var prefixLength = clause.Key.Length + clause.Symbol.Length;
            return (clause.Start + prefixLength, clause.Length - prefixLength);
        }

        return null;
    }
}