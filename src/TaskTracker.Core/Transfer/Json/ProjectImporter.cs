using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// Creates a new project for every project in the file, named so it does not clash with an
/// existing project, together with its setting overrides.
/// </summary>
internal sealed class ProjectImporter(IUnitOfWork work, TimeProvider clock, ImportMap map, IssueList issues)
{
    private const string InvalidThresholdsMessage =
        "With this computer's global settings the red threshold must be nonnegative and no greater than yellow.";

    /// <summary>Creates the projects (not yet saved) and returns them paired with their documents.</summary>
    public async Task<IReadOnlyList<ImportedProject>> CreateAsync(ExportDocument document, CancellationToken cancellationToken)
    {
        var existing = await work.Projects.ListAsync(true, cancellationToken);
        var globalSettings = await work.Settings.GetGlobalAsync(cancellationToken);
        var liveNames = existing.Where(project => project.DeletedAtUtc is null).Select(project => project.Name);
        var takenNames = new TakenNames(liveNames, Project.NameMaxLength);
        var nextOrder = existing.Count == 0 ? 0 : existing.Max(project => project.SortOrder) + 1;
        var documents = document.Projects.OrEmpty();
        var created = new List<ImportedProject>();

        foreach (var position in ImportOrder.Positions(documents, project => project.SortOrder))
        {
            var imported = CreateProject(documents[position], takenNames, nextOrder++);
            var path = ImportChecks.Element("$.projects", position);
            await ApplySettingsAsync(imported, globalSettings, path, cancellationToken);
            created.Add(imported);
        }

        return created;
    }

    private ImportedProject CreateProject(ProjectDocument document, TakenNames takenNames, int sortOrder)
    {
        var project = Project.Create(takenNames.Reserve(document.Name!), clock, sortOrder);

        if (document.Description is not null)
        {
            project.SetDescription(document.Description, clock);
        }

        project.RestoreTimestamps(
            ImportTimestamps.Created(document.CreatedAtUtc, clock),
            ImportTimestamps.Updated(document.UpdatedAtUtc, document.CreatedAtUtc, clock));
        work.Projects.Add(project);
        map.Projects[document.Id!.Value] = project.Id;

        return new ImportedProject(project, document);
    }

    private async Task ApplySettingsAsync(ImportedProject imported, IReadOnlyDictionary<string, string> globalSettings,
        string path, CancellationToken cancellationToken)
    {
        var overrides = imported.Document.Settings ?? new Dictionary<string, string>();
        var effective = SettingsResolver.Resolve(globalSettings, overrides);

        if (!SettingsResolver.HasValidThresholds(effective))
        {
            issues.Add($"{path}.settings", InvalidThresholdsMessage);
            return;
        }

        await StoreOverrideAsync(imported.Project.Id, SettingsCatalogue.AutoCompleteParents, overrides, cancellationToken);
        await StoreOverrideAsync(imported.Project.Id, SettingsCatalogue.UrgencyYellowThreshold, overrides, cancellationToken);
        await StoreOverrideAsync(imported.Project.Id, SettingsCatalogue.UrgencyRedThreshold, overrides, cancellationToken);
        if (overrides.ContainsKey(SettingsCatalogue.RemindersEnabled.Key))
        {
            var text = SettingsCatalogue.RemindersEnabled.Format(effective.RemindersEnabled.Value);
            await work.Settings.SetProjectAsync(imported.Project.Id, SettingsCatalogue.RemindersEnabled.Key, text, cancellationToken);
        }

        await StoreOverrideAsync(imported.Project.Id, SettingsCatalogue.DefaultReminderOffset, overrides, cancellationToken);
        await StoreOverrideAsync(imported.Project.Id, SettingsCatalogue.DateOnlyReminderTime, overrides, cancellationToken);
        imported.EffectiveSettings = effective;
    }

    private async Task StoreOverrideAsync<T>(Guid projectId, SettingDefinition<T> definition,
        IReadOnlyDictionary<string, string> overrides, CancellationToken cancellationToken)
    {
        if (overrides.TryGetValue(definition.Key, out var text))
        {
            await work.Settings.SetProjectAsync(projectId, definition.Key, text, cancellationToken);
        }
    }
}