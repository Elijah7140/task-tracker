using TaskTracker.Core.Projects;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Project information displayed on the home page.</summary>
public sealed class ProjectCardViewModel(ProjectSummary summary)
{
    public Guid Id => summary.Project.Id;

    public string Name => summary.Project.Name;

    public int OpenCount => summary.OpenCount;

    public int OverdueCount => summary.OverdueCount;
}