using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>A project created by an import, kept with its source document until its contents are written.</summary>
internal sealed class ImportedProject(Project project, ProjectDocument document)
{
    public Project Project { get; } = project;

    public ProjectDocument Document { get; } = document;

    /// <summary>The project's settings as they will apply once imported; set when its overrides were stored.</summary>
    public EffectiveSettings? EffectiveSettings { get; set; }
}