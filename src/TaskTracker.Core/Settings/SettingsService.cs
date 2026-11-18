using TaskTracker.Core.Completion;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Undo;

namespace TaskTracker.Core.Settings;

/// <summary>
/// Reads, validates and commits global settings and per-project overrides (§6.5).
/// Every public method is one operation with its own unit of work.
/// </summary>
public sealed class SettingsService(
    IUnitOfWorkFactory unitOfWorkFactory,
    TimeProvider clock, FieldWriteGate? writeGate = null)
{
    private readonly FieldWriteGate gate = writeGate ?? FieldWriteGate.Shared;

    private const string InvalidThresholdsMessage = "Red threshold must be nonnegative and no greater than yellow.";

    /// <summary>Returns the global value of a setting, or its default when none is stored.</summary>
    public async Task<T> GetGlobalAsync<T>(SettingDefinition<T> definition, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var values = await unitOfWork.Settings.GetGlobalAsync(cancellationToken);

        return values.TryGetValue(definition.Key, out var text)
            ? definition.Parse(text)
            : definition.DefaultValue;
    }

    /// <summary>Returns a project's effective settings, each tagged with where its value came from.</summary>
    public async Task<EffectiveSettings> GetEffectiveAsync(Guid projectId, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var global = await unitOfWork.Settings.GetGlobalAsync(cancellationToken);

        return await ResolveEffectiveAsync(unitOfWork, global, projectId, cancellationToken);
    }

    /// <summary>
    /// Counts the parent items that turning auto-complete on globally would complete or reopen,
    /// across every project that inherits the global value and currently has it off.
    /// </summary>
    public async Task<ReconciliationPreview> PreviewGlobalAutoCompleteAsync(CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();

        return await PreviewAsync(unitOfWork, projectId: null, cancellationToken);
    }

    /// <summary>Counts the parent items that turning auto-complete on for one project would complete or reopen.</summary>
    public async Task<ReconciliationPreview> PreviewProjectAutoCompleteAsync(Guid projectId, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();

        return await PreviewAsync(unitOfWork, projectId, cancellationToken);
    }

    /// <summary>
    /// Sets a global value. Throws if the result would leave any project with invalid thresholds,
    /// or if it turns auto-complete on for some project and <paramref name="confirmed"/> is false.
    /// When confirmed, the setting and the resulting completion reconciliation commit together.
    /// </summary>
    public async Task SetGlobalAsync<T>(SettingDefinition<T> definition, T value,
        bool confirmed = false, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var store = unitOfWork.Settings;
        var proposedGlobal = new Dictionary<string, string>(await store.GetGlobalAsync(cancellationToken))
        {
            [definition.Key] = definition.Format(value),
        };

        var enabledProjects = await ValidateChangeAsync(unitOfWork, proposedGlobal, proposedProject: null, confirmed, cancellationToken);
        await store.SetGlobalAsync(definition.Key, definition.Format(value), cancellationToken);
        await ReconcileAndSaveAsync(unitOfWork, enabledProjects, UndoLabels.EditGlobalSettings(), cancellationToken);
    }

    /// <summary>
    /// Saves auto-complete and both urgency thresholds globally as one operation: every project is
    /// validated first, then the values, any completion reconciliation and one save commit together.
    /// Throws if auto-complete turns on for some project and <paramref name="confirmed"/> is false.
    /// A null <paramref name="startWithSystem"/> or <paramref name="cardColumns"/> leaves that setting unchanged.
    /// </summary>
    public async Task SaveGlobalAsync(bool autoCompleteParents, TimeSpan yellow, TimeSpan red,
        bool confirmed = false, ReminderPreferences reminders = default, bool? startWithSystem = null,
        int? cardColumns = null, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var store = unitOfWork.Settings;
        var current = await store.GetGlobalAsync(cancellationToken);
        var proposed = new Dictionary<string, string>(current);
        ProposeGlobal(proposed, SettingsCatalogue.AutoCompleteParents, autoCompleteParents);
        ProposeGlobal(proposed, SettingsCatalogue.UrgencyYellowThreshold, yellow);
        ProposeGlobal(proposed, SettingsCatalogue.UrgencyRedThreshold, red);
        ProposeGlobal(proposed, SettingsCatalogue.RemindersEnabled, reminders.Enabled);
        ProposeGlobal(proposed, SettingsCatalogue.DefaultReminderOffset, reminders.Offset);
        ProposeGlobal(proposed, SettingsCatalogue.DateOnlyReminderTime, reminders.DateOnlyTime);
        ProposeGlobal(proposed, SettingsCatalogue.KeepRunningInTray, reminders.KeepRunningInTray);
        ProposeGlobal(proposed, SettingsCatalogue.StartWithSystem, startWithSystem);
        ProposeGlobal(proposed, SettingsCatalogue.WorkspaceCardColumns, cardColumns);

        var enabledProjects = await ValidateChangeAsync(unitOfWork, proposed, proposedProject: null, confirmed, cancellationToken);
        foreach (var (key, value) in proposed)
        {
            if (current.GetValueOrDefault(key) != value)
            {
                await store.SetGlobalAsync(key, value, cancellationToken);
            }
        }

        await ReconcileAndSaveAsync(unitOfWork, enabledProjects, UndoLabels.EditGlobalSettings(), cancellationToken);
    }

    /// <summary>
    /// Saves a project's auto-complete and urgency overrides as one operation; a null value means
    /// the project inherits the global value. Same validation and confirmation rules as
    /// <see cref="SaveGlobalAsync"/>, applied to that project.
    /// </summary>
    public async Task SaveProjectAsync(Guid projectId, bool? autoCompleteParents, TimeSpan? yellow, TimeSpan? red,
        bool confirmed = false, ReminderPreferences? reminders = null, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var store = unitOfWork.Settings;
        var proposed = new Dictionary<string, string>(await store.GetProjectAsync(projectId, cancellationToken));
        ProposeOverride(proposed, SettingsCatalogue.AutoCompleteParents, autoCompleteParents);
        ProposeOverride(proposed, SettingsCatalogue.UrgencyYellowThreshold, yellow);
        ProposeOverride(proposed, SettingsCatalogue.UrgencyRedThreshold, red);

        var enabledProjects = await ValidateProjectChangeAsync(unitOfWork, projectId, proposed, confirmed, cancellationToken);
        await StoreProjectAsync(store, projectId, SettingsCatalogue.AutoCompleteParents, proposed, cancellationToken);
        await StoreProjectAsync(store, projectId, SettingsCatalogue.UrgencyYellowThreshold, proposed, cancellationToken);
        await StoreProjectAsync(store, projectId, SettingsCatalogue.UrgencyRedThreshold, proposed, cancellationToken);
        if (reminders is { } preferences)
        {
            await SaveReminderSettingsAsync(store, projectId, preferences, cancellationToken);
        }

        await ReconcileAndSaveAsync(unitOfWork, enabledProjects, UndoLabels.EditProjectSettings(), cancellationToken);
    }

    private static async Task SaveReminderSettingsAsync(ISettingsStore store, Guid projectId,
        ReminderPreferences preferences, CancellationToken cancellationToken)
    {
        await SaveReminderOverrideAsync(store, projectId, SettingsCatalogue.RemindersEnabled, preferences.Enabled, cancellationToken);
        await SaveReminderOverrideAsync(store, projectId, SettingsCatalogue.DefaultReminderOffset, preferences.Offset, cancellationToken);
        await SaveReminderOverrideAsync(store, projectId, SettingsCatalogue.DateOnlyReminderTime, preferences.DateOnlyTime, cancellationToken);
    }

    private static Task SaveReminderOverrideAsync<T>(ISettingsStore store, Guid projectId,
        SettingDefinition<T> definition, T? value, CancellationToken cancellationToken) where T : struct
    {
        var text = value.HasValue ? definition.Format(value.Value) : null;
        return store.SetProjectAsync(projectId, definition.Key, text, cancellationToken);
    }

    private static void ProposeGlobal<T>(Dictionary<string, string> proposed, SettingDefinition<T> definition, T? value)
        where T : struct
    {
        if (value is not T requested)
        {
            return;
        }

        var current = proposed.TryGetValue(definition.Key, out var text) ? definition.Parse(text) : definition.DefaultValue;
        if (!EqualityComparer<T>.Default.Equals(current, requested))
        {
            proposed[definition.Key] = definition.Format(requested);
        }
    }

    private static void ProposeOverride<T>(Dictionary<string, string> proposed,
        SettingDefinition<T> definition, T? value) where T : struct
    {
        if (value is null)
        {
            proposed.Remove(definition.Key);
        }
        else
        {
            proposed[definition.Key] = definition.Format(value.Value);
        }
    }

    private static Task StoreProjectAsync<T>(ISettingsStore store, Guid projectId, SettingDefinition<T> definition,
        IReadOnlyDictionary<string, string> proposed, CancellationToken cancellationToken)
    {
        proposed.TryGetValue(definition.Key, out var text);

        return store.SetProjectAsync(projectId, definition.Key, text, cancellationToken);
    }

    /// <summary>
    /// Overrides a setting for one project. Same validation and confirmation rules as
    /// <see cref="SetGlobalAsync{T}"/>, applied to that project.
    /// </summary>
    public async Task SetProjectOverrideAsync<T>(Guid projectId, SettingDefinition<T> definition, T value,
        bool confirmed = false, CancellationToken cancellationToken = default)
    {
        if (!definition.ProjectOverridable)
        {
            throw new DomainRuleException("This setting cannot be overridden.");
        }

        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var store = unitOfWork.Settings;
        var proposedOverrides = new Dictionary<string, string>(await store.GetProjectAsync(projectId, cancellationToken))
        {
            [definition.Key] = definition.Format(value),
        };

        var enabledProjects = await ValidateProjectChangeAsync(unitOfWork, projectId, proposedOverrides, confirmed, cancellationToken);
        await store.SetProjectAsync(projectId, definition.Key, definition.Format(value), cancellationToken);
        await ReconcileAndSaveAsync(unitOfWork, enabledProjects, UndoLabels.EditProjectSettings(), cancellationToken);
    }

    /// <summary>
    /// Removes a project's override so it inherits the global value again. Same validation and
    /// confirmation rules as <see cref="SetGlobalAsync{T}"/>, applied to that project.
    /// </summary>
    public async Task ClearProjectOverrideAsync<T>(Guid projectId, SettingDefinition<T> definition,
        bool confirmed = false, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var store = unitOfWork.Settings;
        var proposedOverrides = new Dictionary<string, string>(await store.GetProjectAsync(projectId, cancellationToken));
        proposedOverrides.Remove(definition.Key);

        var enabledProjects = await ValidateProjectChangeAsync(unitOfWork, projectId, proposedOverrides, confirmed, cancellationToken);
        await store.SetProjectAsync(projectId, definition.Key, null, cancellationToken);
        await ReconcileAndSaveAsync(unitOfWork, enabledProjects, UndoLabels.EditProjectSettings(), cancellationToken);
    }

    private static async Task<EffectiveSettings> ResolveEffectiveAsync(IUnitOfWork unitOfWork,
        IReadOnlyDictionary<string, string> global, Guid projectId, CancellationToken cancellationToken)
    {
        var overrides = await unitOfWork.Settings.GetProjectAsync(projectId, cancellationToken);

        return SettingsResolver.Resolve(global, overrides);
    }

    private async Task<ReconciliationPreview> PreviewAsync(IUnitOfWork unitOfWork, Guid? projectId, CancellationToken cancellationToken)
    {
        var global = await unitOfWork.Settings.GetGlobalAsync(cancellationToken);
        var activeProjects = await unitOfWork.Projects.ListAsync(false, cancellationToken);
        var parentsToComplete = 0;
        var parentsToReopen = 0;

        foreach (var project in activeProjects.Where(project => projectId is null || project.Id == projectId))
        {
            var effective = await ResolveEffectiveAsync(unitOfWork, global, project.Id, cancellationToken);
            var alreadyOn = effective.AutoCompleteParents.Value;
            var unaffectedByGlobalChange = projectId is null && effective.AutoCompleteParents.Source == SettingSource.Project;

            if (alreadyOn || unaffectedByGlobalChange)
            {
                continue;
            }

            var preview = await ProjectCompletionReconciler.PreviewAsync(unitOfWork, project.Id, clock, cancellationToken);
            parentsToComplete += preview.ParentsToComplete;
            parentsToReopen += preview.ParentsToReopen;
        }

        return new ReconciliationPreview(parentsToComplete, parentsToReopen);
    }

    private async Task<List<Guid>> ValidateProjectChangeAsync(IUnitOfWork unitOfWork, Guid projectId,
        IReadOnlyDictionary<string, string> proposedOverrides, bool confirmed, CancellationToken cancellationToken)
    {
        if (await unitOfWork.Projects.FindAsync(projectId, false, cancellationToken) is null)
        {
            throw new DomainRuleException("Project is missing or deleted.");
        }

        var global = await unitOfWork.Settings.GetGlobalAsync(cancellationToken);

        return await ValidateChangeAsync(unitOfWork, global, (projectId, proposedOverrides), confirmed, cancellationToken);
    }

    /// <summary>
    /// Checks a proposed change against every project, including soft-deleted ones (so a later
    /// restore can't produce invalid thresholds), and returns the active projects whose
    /// effective auto-complete turns on.
    /// </summary>
    private static async Task<List<Guid>> ValidateChangeAsync(IUnitOfWork unitOfWork,
        IReadOnlyDictionary<string, string> proposedGlobal,
        (Guid Id, IReadOnlyDictionary<string, string> Overrides)? proposedProject,
        bool confirmed,
        CancellationToken cancellationToken)
    {
        EnsureValidGlobalThresholds(proposedGlobal);

        var currentGlobal = await unitOfWork.Settings.GetGlobalAsync(cancellationToken);
        var enabledProjects = new List<Guid>();

        foreach (var project in await unitOfWork.Projects.ListAsync(true, cancellationToken))
        {
            var currentOverrides = await unitOfWork.Settings.GetProjectAsync(project.Id, cancellationToken);
            var proposedOverrides = proposedProject?.Id == project.Id ? proposedProject.Value.Overrides : currentOverrides;
            var current = SettingsResolver.Resolve(currentGlobal, currentOverrides);
            var next = SettingsResolver.Resolve(proposedGlobal, proposedOverrides);

            EnsureValidProjectThresholds(project, next, edited: proposedProject?.Id == project.Id);

            if (project.DeletedAtUtc is null && !current.AutoCompleteParents.Value && next.AutoCompleteParents.Value)
            {
                enabledProjects.Add(project.Id);
            }
        }

        if (enabledProjects.Count > 0 && !confirmed)
        {
            throw new DomainRuleException("Enabling automatic completion requires confirmation.");
        }

        return enabledProjects;
    }

    private static void EnsureValidGlobalThresholds(IReadOnlyDictionary<string, string> proposedGlobal)
    {
        var effective = SettingsResolver.Resolve(proposedGlobal, new Dictionary<string, string>());

        if (!SettingsResolver.HasValidThresholds(effective))
        {
            throw new DomainRuleException(InvalidThresholdsMessage);
        }
    }

    private static void EnsureValidProjectThresholds(Project project, EffectiveSettings next, bool edited)
    {
        if (SettingsResolver.HasValidThresholds(next))
        {
            return;
        }

        throw new DomainRuleException(edited ? InvalidThresholdsMessage : DescribeConflict(project.Name, next));
    }

    private static string DescribeConflict(string projectName, EffectiveSettings next)
    {
        var yellow = next.UrgencyYellowThreshold;
        var red = next.UrgencyRedThreshold;

        if (yellow.Source == SettingSource.Project && red.Source != SettingSource.Project)
        {
            return $"Project '{projectName}' overrides the yellow threshold to {DescribeDuration(yellow.Value)}, " +
                "so the red threshold can't exceed it.";
        }

        if (red.Source == SettingSource.Project && yellow.Source != SettingSource.Project)
        {
            return $"Project '{projectName}' overrides the red threshold to {DescribeDuration(red.Value)}, " +
                "so the yellow threshold can't be lower than it.";
        }

        return $"Project '{projectName}' would be left with invalid thresholds. {InvalidThresholdsMessage}";
    }

    private static string DescribeDuration(TimeSpan value)
    {
        return value.TotalHours >= 24 && value.TotalHours % 24 == 0
            ? $"{value.TotalDays:0.##} days"
            : $"{value.TotalHours:0.##} hours";
    }

    private async Task ReconcileAndSaveAsync(IUnitOfWork unitOfWork, IReadOnlyList<Guid> enabledProjects,
        string label, CancellationToken cancellationToken)
    {
        foreach (var projectId in enabledProjects)
        {
            await ProjectCompletionReconciler.ReconcileAsync(unitOfWork, projectId, clock, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(label, enabledProjects, cancellationToken);
    }
}