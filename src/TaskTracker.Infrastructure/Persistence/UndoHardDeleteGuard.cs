using System.Linq.Expressions;
using System.Reflection;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

using TaskTracker.Core;
using TaskTracker.Core.Lookups;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Checks every mapped foreign key into a row replay will physically remove.</summary>
internal static class UndoHardDeleteGuard
{
    private static readonly MethodInfo ReadKeysMethod = typeof(UndoHardDeleteGuard)
        .GetMethod(nameof(ReadDependentKeysAsync), BindingFlags.Static | BindingFlags.NonPublic)!;

    public static async Task VerifyAsync(TaskTrackerDbContext database, IReadOnlyList<UndoRowSnapshot> rows,
        bool forward, CancellationToken cancellationToken)
    {
        var removals = rows.Where(row => row.Target(forward) is null).ToLookup(row => row.EntityType);
        foreach (var group in removals)
        {
            var entityType = database.Model.FindEntityType(group.Key)!;
            foreach (var row in group)
            {
                await VerifyReferencesAsync(database, entityType, row, removals, forward, cancellationToken);
            }
        }
    }

    private static async Task VerifyReferencesAsync(TaskTrackerDbContext database, IEntityType entityType,
        UndoRowSnapshot row, ILookup<Type, UndoRowSnapshot> removals, bool forward, CancellationToken cancellationToken)
    {
        // SQLite's search triggers also remove the derived FTS index entries for an item.
        foreach (var reference in entityType.GetReferencingForeignKeys())
        {
            var dependentType = reference.DeclaringEntityType.ClrType;
            var read = ReadKeysMethod.MakeGenericMethod(dependentType);
            var pendingKeys = (Task<List<object[]>>)read.Invoke(null,
                [database, reference, row.Source(forward)!, cancellationToken])!;
            var removed = removals[dependentType];
            foreach (var key in await pendingKeys)
            {
                if (!removed.Any(dependent => dependent.Key.SequenceEqual(key)))
                {
                    throw new DomainRuleException(ConflictMessage(row, forward));
                }
            }
        }
    }

    private static Task<List<object[]>> ReadDependentKeysAsync<TEntity>(TaskTrackerDbContext database,
        IForeignKey reference, Dictionary<string, object?> source, CancellationToken cancellationToken)
        where TEntity : class
    {
        var dependent = Expression.Parameter(typeof(TEntity), "dependent");
        var condition = reference.Properties.Zip(reference.PrincipalKey.Properties, (foreign, principal) =>
            Expression.Equal(Property(dependent, foreign),
                Expression.Convert(Expression.Constant(source[principal.Name]), foreign.ClrType)))
            .Aggregate<BinaryExpression, Expression>(Expression.Constant(true), Expression.AndAlso);
        var matches = Expression.Lambda<Func<TEntity, bool>>(condition, dependent);
        var key = reference.DeclaringEntityType.FindPrimaryKey()!;
        var values = Expression.NewArrayInit(typeof(object), key.Properties.Select(property =>
            Expression.Convert(Property(dependent, property), typeof(object))));
        var selectKey = Expression.Lambda<Func<TEntity, object[]>>(values, dependent);

        return database.Set<TEntity>().IgnoreQueryFilters().Where(matches).Select(selectKey).ToListAsync(cancellationToken);
    }

    private static MethodCallExpression Property(ParameterExpression entity, IProperty property)
    {
        return Expression.Call(typeof(EF), nameof(EF.Property), [property.ClrType], entity,
            Expression.Constant(property.Name));
    }

    private static string ConflictMessage(UndoRowSnapshot row, bool forward)
    {
        var verb = forward ? "redo" : "undo";
        return row.EntityType == typeof(StatusLevel)
            ? $"This status is still used by an item and cannot be removed. Please clear its references before trying to {verb}."
            : $"Other data still depends on this {EfUndoableChange.SubjectName(row)}; can't {verb} its removal.";
    }
}