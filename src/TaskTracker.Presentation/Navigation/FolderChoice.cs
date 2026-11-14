namespace TaskTracker.Presentation.Navigation;

/// <summary>A possible parent folder in a move dialog; null represents the project root.</summary>
public sealed record FolderChoice(Guid? Id, string Name, int Depth);