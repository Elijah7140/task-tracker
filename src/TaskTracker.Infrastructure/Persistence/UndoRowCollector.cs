using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>
/// Snapshots the pending changes of a labelled save: every added, modified or deleted item, folder,
/// project, item field value, item link, status and priority level. A row whose only change is its
/// <c>UpdatedAtUtc</c> stamp is left out, so a step holds just the rows the user action really changed.
/// </summary>
internal static class UndoRowCollector
{
    private const string UpdatedAtProperty = "UpdatedAtUtc";

    public static List<UndoRowSnapshot> Collect(ChangeTracker tracker)
    {
        tracker.DetectChanges();
        var rows = new List<UndoRowSnapshot>();

        foreach (var entry in tracker.Entries())
        {
            if (IsUndoableEntity(entry.Entity) && HasMeaningfulChange(entry))
            {
                rows.Add(UndoRowSnapshot.Capture(entry));
            }
        }

        return rows;
    }

    private static bool IsUndoableEntity(object entity)
    {
        return entity is TodoItem or Folder or Project or ItemFieldValue or ItemLink or StatusLevel or PriorityLevel;
    }

    private static bool HasMeaningfulChange(EntityEntry entry)
    {
        if (entry.State is EntityState.Added or EntityState.Deleted)
        {
            return true;
        }

        return entry.State == EntityState.Modified && ChangesMoreThanUpdateStamp(entry);
    }

    private static bool ChangesMoreThanUpdateStamp(EntityEntry entry)
    {
        foreach (var property in entry.Properties)
        {
            if (property.IsModified && property.Metadata.Name != UpdatedAtProperty)
            {
                return true;
            }
        }

        return false;
    }
}