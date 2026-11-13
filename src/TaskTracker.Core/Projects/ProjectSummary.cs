namespace TaskTracker.Core.Projects;

/// <summary>Home-screen project details and item counts.</summary>
public sealed record ProjectSummary(Project Project, int OpenCount, int OverdueCount);