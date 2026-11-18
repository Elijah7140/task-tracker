namespace TaskTracker.Presentation.Installation;

/// <summary>What App Settings needs for its About line, update checks and the start-with-system option.</summary>
public sealed record InstallationServices(AppVersion Version, IUpdateService Updates, IStartupRegistration Startup);