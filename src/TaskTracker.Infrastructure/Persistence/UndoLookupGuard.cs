using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.Lookups;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Checks lookup uniqueness in the list that would exist after replay.</summary>
internal static class UndoLookupGuard
{
    public static async Task VerifyAsync(TaskTrackerDbContext database, IReadOnlyList<UndoRowSnapshot> rows,
        bool forward, CancellationToken cancellationToken)
    {
        await VerifyListAsync(database.ItemTypes, rows, forward, "item type", cancellationToken);
        await VerifyListAsync(database.PriorityLevels, rows, forward, "priority level", cancellationToken);
        await VerifyListAsync(database.Statuses, rows, forward, "status", cancellationToken);
    }

    private static async Task VerifyListAsync<TEntity>(DbSet<TEntity> table, IReadOnlyList<UndoRowSnapshot> rows,
        bool forward, string kind, CancellationToken cancellationToken) where TEntity : LookupEntity
    {
        var changes = rows.Where(row => row.EntityType == typeof(TEntity))
            .ToDictionary(row => (Guid)row.Key[0], row => row.Target(forward));
        if (changes.Count == 0)
        {
            return;
        }

        var current = await table.AsNoTracking().ToListAsync(cancellationToken);
        var final = current.Where(row => !changes.ContainsKey(row.Id))
            .Select(row => new LookupValues(row.Name, row.SortOrder, row.IsArchived, (row as PriorityLevel)?.Number))
            .Concat(changes.Values.OfType<Dictionary<string, object?>>().Select(ReadValues));
        VerifyFinalList(final, kind, forward ? "redo" : "undo");
    }

    private static LookupValues ReadValues(Dictionary<string, object?> values)
    {
        return new LookupValues((string)values[nameof(LookupEntity.Name)]!, (int)values[nameof(LookupEntity.SortOrder)]!,
            (bool)values[nameof(LookupEntity.IsArchived)]!, (int?)values.GetValueOrDefault(nameof(PriorityLevel.Number)));
    }

    private static void VerifyFinalList(IEnumerable<LookupValues> final, string kind, string verb)
    {
        var names = new HashSet<string>(LookupEntity.NameComparer);
        var ranks = new HashSet<int>();
        var numbers = new HashSet<int>();
        foreach (var row in final)
        {
            if (row.Name.Length > 0 && !names.Add(row.Name))
            {
                throw new DomainRuleException($"Another {kind} now uses the name '{row.Name}'; can't {verb}.");
            }

            if (!ranks.Add(row.Rank))
            {
                throw new DomainRuleException($"Another {kind} now uses the same rank; can't {verb}.");
            }

            if (!row.Archived && row.Number is int number && !numbers.Add(number))
            {
                throw new DomainRuleException($"Priority number {number} is now in use; can't {verb}.");
            }
        }
    }

    private sealed record LookupValues(string Name, int Rank, bool Archived, int? Number);
}