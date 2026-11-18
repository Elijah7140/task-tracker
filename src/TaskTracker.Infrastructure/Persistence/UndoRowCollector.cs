using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Settings;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>
/// Snapshots pending user-data changes in a labelled save and discards incidental update stamps.
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
            if (IsUndoableEntity(entry.Entity) && CaptureChange(entry))
            {
                rows.Add(UndoRowSnapshot.Capture(entry));
            }
        }

        return rows;
    }

    private static bool IsUndoableEntity(object entity)
    {
        return entity is TodoItem or Folder or Project or ItemFieldValue or ItemLink or LookupEntity
            or FieldDefinition or FieldChoice or ProjectSettingRow or SavedSearch
            || entity is GlobalSettingRow setting && setting.Key != SettingsCatalogue.StartWithSystem.Key;
    }

    private static bool CaptureChange(EntityEntry entry)
    {
        if (entry.State is EntityState.Added or EntityState.Deleted)
        {
            return true;
        }

        if (entry.State != EntityState.Modified)
        {
            return false;
        }

        if (ChangesMoreThanUpdateStamp(entry))
        {
            return true;
        }

        // A timestamp-only write would leave no step and invalidate earlier snapshots of this row.
        entry.State = EntityState.Unchanged;
        return false;
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