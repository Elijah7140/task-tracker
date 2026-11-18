using TaskTracker.Presentation.Installation;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Records start-with-system changes, so tests never touch the registry or autostart folder.</summary>
public sealed class FakeStartupRegistration : IStartupRegistration
{
    public bool IsAvailable { get; set; }

    public List<bool> Applied { get; } = [];

    public bool TryApply(bool enabled)
    {
        Applied.Add(enabled);
        return true;
    }
}