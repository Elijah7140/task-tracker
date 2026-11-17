using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

using TaskTracker.Core.Items;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>
/// The scalar values of one row before and after an operation. A null <see cref="Before"/> means the
/// operation created the row; a null <see cref="After"/> means it removed the row.
/// </summary>
internal sealed class UndoRowSnapshot
{
    public required Type EntityType { get; init; }

    public required object[] Key { get; init; }

    public required Dictionary<string, object?>? Before { get; init; }

    public required Dictionary<string, object?>? After { get; init; }

    /// <summary>Captures a tracked entry that has pending changes; call it before saving.</summary>
    public static UndoRowSnapshot Capture(EntityEntry entry)
    {
        var isAdded = entry.State == EntityState.Added;
        var isDeleted = entry.State == EntityState.Deleted;

        return new UndoRowSnapshot
        {
            EntityType = entry.Metadata.ClrType,
            Key = ReadKey(entry),
            Before = isAdded ? null : Copy(entry.OriginalValues),
            After = isDeleted ? null : Copy(entry.CurrentValues)
        };
    }

    private static object[] ReadKey(EntityEntry entry)
    {
        var key = entry.Metadata.FindPrimaryKey()!;
        var values = new List<object>();

        foreach (var property in key.Properties)
        {
            values.Add(entry.Property(property.Name).CurrentValue!);
        }

        return values.ToArray();
    }

    private static Dictionary<string, object?> Copy(PropertyValues values)
    {
        var result = new Dictionary<string, object?>();

        foreach (var property in values.Properties)
        {
            if (property.Name != nameof(TodoItem.ReminderDeliveredFor))
            {
                result[property.Name] = values[property.Name];
            }
        }

        return result;
    }
}