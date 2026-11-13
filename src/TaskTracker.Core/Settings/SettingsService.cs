using TaskTracker.Core.Completion;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Settings;

/// <summary>
/// Reads, validates and commits global settings and per-project overrides (§6.5).
/// Every public method is one operation with its own unit of work.
/// </summary>
public sealed class SettingsService(
    IUnitOfWorkFactory unitOfWorkFactory,
    TimeProvider clock)
{
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
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var store = unitOfWork.Settings;
        var proposedGlobal = new Dictionary<string, string>(await store.GetGlobalAsync(cancellationToken))
        {
            [definition.Key] = definition.Format(value),
        };

        var enabledProjects = await ValidateChangeAsync(unitOfWork, proposedGlobal, proposedProject: null, confirmed, cancellationToken);
        await store.SetGlobalAsync(definition.Key, definition.Format(value), cancellationToken);
        await ReconcileAndSaveAsync(unitOfWork, enabledProjects, cancellationToken);
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

        await using var unitOfWork = unitOfWorkFactory.Begin();
        var store = unitOfWork.Settings;
        var proposedOverrides = new Dictionary<string, string>(await store.GetProjectAsync(projectId, cancellationToken))
        {
            [definition.Key] = definition.Format(value),
        };

        var enabledProjects = await ValidateProjectChangeAsync(unitOfWork, projectId, proposedOverrides, confirmed, cancellationToken);
        await store.SetProjectAsync(projectId, definition.Key, definition.Format(value), cancellationToken);
        await ReconcileAndSaveAsync(unitOfWork, enabledProjects, cancellationToken);
    }

    /// <summary>
    /// Removes a project's override so it inherits the global value again. Same validation and
    /// confirmation rules as <see cref="SetGlobalAsync{T}"/>, applied to that project.
    /// </summary>
    public async Task ClearProjectOverrideAsync<T>(Guid projectId, SettingDefinition<T> definition,
        bool confirmed = false, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var store = unitOfWork.Settings;
        var proposedOverrides = new Dictionary<string, string>(await store.GetProjectAsync(projectId, cancellationToken));
        proposedOverrides.Remove(definition.Key);

        var enabledProjects = await ValidateProjectChangeAsync(unitOfWork, projectId, proposedOverrides, confirmed, cancellationToken);
        await store.SetProjectAsync(projectId, definition.Key, null, cancellationToken);
        await ReconcileAndSaveAsync(unitOfWork, enabledProjects, cancellationToken);
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
        EnsureValidThresholds(SettingsResolver.Resolve(proposedGlobal, new Dictionary<string, string>()));

        var currentGlobal = await unitOfWork.Settings.GetGlobalAsync(cancellationToken);
        var enabledProjects = new List<Guid>();

        foreach (var project in await unitOfWork.Projects.ListAsync(true, cancellationToken))
        {
            var currentOverrides = await unitOfWork.Settings.GetProjectAsync(project.Id, cancellationToken);
            var proposedOverrides = proposedProject?.Id == project.Id ? proposedProject.Value.Overrides : currentOverrides;
            var current = SettingsResolver.Resolve(currentGlobal, currentOverrides);
            var next = SettingsResolver.Resolve(proposedGlobal, proposedOverrides);

            EnsureValidThresholds(next);

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

    private static void EnsureValidThresholds(EffectiveSettings settings)
    {
        if (!SettingsResolver.HasValidThresholds(settings))
        {
            throw new DomainRuleException(InvalidThresholdsMessage);
        }
    }

    private async Task ReconcileAndSaveAsync(IUnitOfWork unitOfWork, IReadOnlyList<Guid> enabledProjects, CancellationToken cancellationToken)
    {
        foreach (var projectId in enabledProjects)
        {
            await ProjectCompletionReconciler.ReconcileAsync(unitOfWork, projectId, clock, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
    }
}