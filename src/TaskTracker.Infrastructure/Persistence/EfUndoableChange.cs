using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Undo;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>
/// One recorded operation. Undo and redo each open a fresh context, check that every affected row
/// still holds the values the previous step left behind, then write the other set of values back
/// in a single save. Any mismatch refuses the whole step.
/// </summary>
internal sealed class EfUndoableChange(
    IDbContextFactory<TaskTrackerDbContext> contexts,
    IReadOnlyList<UndoRowSnapshot> rows,
    string description, DataSaved? saved = null) : IUndoableChange
{
    public string Description => description;

    public Task UndoAsync(CancellationToken cancellationToken = default)
    {
        return ApplyAsync(false, cancellationToken);
    }

    public Task RedoAsync(CancellationToken cancellationToken = default)
    {
        return ApplyAsync(true, cancellationToken);
    }

    private async Task ApplyAsync(bool forward, CancellationToken cancellationToken)
    {
        await using var database = await contexts.CreateDbContextAsync(cancellationToken);
        var current = await LoadAndVerifyAsync(database, forward, cancellationToken);

        for (var index = 0; index < rows.Count; index++)
        {
            WriteRow(database, rows[index], current[index], forward);
        }

        await SaveAsync(database, forward, cancellationToken);
        saved?.Publish();
    }

    /// <summary>Translates a refused database write into an explanation for the user.</summary>
    private static async Task SaveAsync(TaskTrackerDbContext database, bool forward,
        CancellationToken cancellationToken)
    {
        try
        {
            await database.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
        {
            var message = SaveFailureMessage(exception, forward);
            throw new DomainRuleException(message, exception);
        }
    }

    private static string SaveFailureMessage(DbUpdateException exception, bool forward)
    {
        var reason = exception.InnerException?.Message;
        if (reason?.Contains("This status is still used by an item", StringComparison.Ordinal) == true)
        {
            return $"This status is still used by an item and cannot be removed. Please clear its references before trying to {Verb(forward)}.";
        }

        if (reason?.Contains("At least one Done status must stay active", StringComparison.Ordinal) == true)
        {
            return $"At least one Done status must stay active. Add or restore another Done status before trying to {Verb(forward)}.";
        }

        return $"This change references something that was removed; can't {Verb(forward)}.";
    }

    private async Task<List<object?>> LoadAndVerifyAsync(TaskTrackerDbContext database, bool forward,
        CancellationToken cancellationToken)
    {
        var current = new List<object?>();

        foreach (var row in rows)
        {
            var entity = await FindRowAsync(database, row, cancellationToken);
            Verify(database, row, entity, forward);
            current.Add(entity);
        }

        return current;
    }

    /// <summary>Finds a row including soft-deleted ones, which the global query filters would hide.</summary>
    private static async Task<object?> FindRowAsync(TaskTrackerDbContext database, UndoRowSnapshot row,
        CancellationToken cancellationToken)
    {
        if (row.EntityType == typeof(TodoItem))
        {
            return await FindByIdAsync(database.TodoItems, row, cancellationToken);
        }

        if (row.EntityType == typeof(Folder))
        {
            return await FindByIdAsync(database.Folders, row, cancellationToken);
        }

        if (row.EntityType == typeof(Project))
        {
            return await FindByIdAsync(database.Projects, row, cancellationToken);
        }

        return await database.FindAsync(row.EntityType, row.Key, cancellationToken);
    }

    private static async Task<object?> FindByIdAsync<TEntity>(IQueryable<TEntity> set, UndoRowSnapshot row,
        CancellationToken cancellationToken)
        where TEntity : class
    {
        var id = (Guid)row.Key[0];
        return await set.IgnoreQueryFilters()
            .SingleOrDefaultAsync(entity => EF.Property<Guid>(entity, "Id") == id, cancellationToken);
    }

    private static void Verify(TaskTrackerDbContext database, UndoRowSnapshot row, object? entity, bool forward)
    {
        var expected = forward ? row.Before : row.After;

        if (expected is null && entity is null)
        {
            return;
        }

        if (entity is null)
        {
            throw new DomainRuleException(
                $"This {SubjectName(row)} was permanently deleted since; can't {Verb(forward)}.");
        }

        if (expected is null || ValuesDiffer(database, entity, expected))
        {
            throw new DomainRuleException($"This {SubjectName(row)} changed since; can't {Verb(forward)}.");
        }
    }

    private static bool ValuesDiffer(TaskTrackerDbContext database, object entity,
        Dictionary<string, object?> expected)
    {
        var entry = database.Entry(entity);

        foreach (var (name, value) in expected)
        {
            if (!Equals(entry.Property(name).CurrentValue, value))
            {
                return true;
            }
        }

        return false;
    }

    private static string SubjectName(UndoRowSnapshot row)
    {
        if (row.EntityType == typeof(Folder))
        {
            return "folder";
        }

        if (row.EntityType == typeof(Project))
        {
            return "project";
        }

        if (row.EntityType == typeof(StatusLevel))
        {
            return "status";
        }

        if (row.EntityType == typeof(PriorityLevel))
        {
            return "priority level";
        }

        return "item";
    }

    private static string Verb(bool forward)
    {
        return forward ? "redo" : "undo";
    }

    private static void WriteRow(TaskTrackerDbContext database, UndoRowSnapshot row, object? existing,
        bool forward)
    {
        var target = forward ? row.After : row.Before;

        if (target is null)
        {
            RemoveRow(database, existing);
            return;
        }

        var entity = existing ?? AddNewRow(database, row.EntityType);
        CopyValues(database, entity, target);
    }

    private static void RemoveRow(TaskTrackerDbContext database, object? existing)
    {
        if (existing is not null)
        {
            database.Remove(existing);
        }
    }

    /// <summary>Entities have private constructors, so the row is created reflectively and then filled with its values.</summary>
    private static object AddNewRow(TaskTrackerDbContext database, Type entityType)
    {
        var entity = Activator.CreateInstance(entityType, nonPublic: true)
            ?? throw new InvalidOperationException($"Cannot create a {entityType.Name}.");
        database.Add(entity);
        return entity;
    }

    private static void CopyValues(TaskTrackerDbContext database, object entity, Dictionary<string, object?> values)
    {
        var entry = database.Entry(entity);

        foreach (var (name, value) in values)
        {
            entry.Property(name).CurrentValue = value;
        }
    }
}