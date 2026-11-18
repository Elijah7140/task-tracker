using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Checks replayed settings against projects and items outside the recorded step.</summary>
internal static class UndoSettingsGuard
{
    public static async Task VerifyAsync(TaskTrackerDbContext database, IReadOnlyList<UndoRowSnapshot> rows,
        bool forward, CancellationToken cancellationToken)
    {
        var globalRows = rows.Where(row => row.EntityType == typeof(GlobalSettingRow)).ToArray();
        var projectRows = rows.Where(row => row.EntityType == typeof(ProjectSettingRow)).ToLookup(row => (Guid)row.Key[0]);

        if (globalRows.Length == 0 && projectRows.Count == 0)
        {
            return;
        }

        var store = new EfSettingsStore(database);
        var global = await store.GetGlobalAsync(cancellationToken);
        var nextGlobal = ProjectValues(global, globalRows, forward);
        EnsureValidThresholds(SettingsResolver.Resolve(nextGlobal, new Dictionary<string, string>()));
        var projects = await new EfProjectRepository(database).ListAsync(true, cancellationToken);

        foreach (var project in projects.Where(project => globalRows.Length > 0 || projectRows.Contains(project.Id)))
        {
            var overrides = await store.GetProjectAsync(project.Id, cancellationToken);
            var nextOverrides = ProjectValues(overrides, projectRows[project.Id], forward);
            var current = SettingsResolver.Resolve(global, overrides);
            var next = SettingsResolver.Resolve(nextGlobal, nextOverrides);
            EnsureValidThresholds(next);

            if (project.DeletedAtUtc is null && next.AutoCompleteParents.Value && !current.AutoCompleteParents.Value)
            {
                await VerifyCompletionAsync(database, project.Id, rows, forward, cancellationToken);
            }
        }
    }

    private static IReadOnlyDictionary<string, string> ProjectValues(IReadOnlyDictionary<string, string> current,
        IEnumerable<UndoRowSnapshot> changes, bool forward)
    {
        var proposed = new Dictionary<string, string>(current);

        foreach (var row in changes)
        {
            var key = (string)row.Key[^1];
            var target = forward ? row.After : row.Before;
            if (target is null)
            {
                proposed.Remove(key);
            }
            else
            {
                proposed[key] = (string)target[nameof(GlobalSettingRow.Value)]!;
            }
        }

        return proposed;
    }

    private static void EnsureValidThresholds(EffectiveSettings settings)
    {
        if (!SettingsResolver.HasValidThresholds(settings))
        {
            throw new DomainRuleException("Settings changed since. Applying this step would leave invalid urgency thresholds.");
        }
    }

    private static async Task VerifyCompletionAsync(TaskTrackerDbContext database, Guid projectId,
        IReadOnlyList<UndoRowSnapshot> rows, bool forward, CancellationToken cancellationToken)
    {
        var items = await database.TodoItems.Where(item => item.ProjectId == projectId)
            .Select(item => new { item.Id, item.ParentItemId, item.CompletedAtUtc }).ToListAsync(cancellationToken);
        var proposed = rows.Where(row => row.EntityType == typeof(TodoItem)).ToDictionary(
            row => (Guid)row.Key[0],
            row => (DateTime?)(forward ? row.After : row.Before)?[nameof(TodoItem.CompletedAtUtc)]);
        var complete = items.ToDictionary(item => item.Id,
            item => proposed.GetValueOrDefault(item.Id, item.CompletedAtUtc).HasValue);

        foreach (var children in items.Where(item => item.ParentItemId.HasValue).GroupBy(item => item.ParentItemId!.Value))
        {
            if (complete.TryGetValue(children.Key, out var parentComplete)
                && parentComplete != children.All(child => complete[child.Id]))
            {
                throw new DomainRuleException("Items changed since. Applying this setting would leave parent completion out of date.");
            }
        }
    }
}