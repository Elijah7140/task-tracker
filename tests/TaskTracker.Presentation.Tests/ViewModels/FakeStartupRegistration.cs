using TaskTracker.Presentation.Installation;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Records start-with-system changes; <see cref="Succeeds"/> decides whether the system "accepted" them.</summary>
internal sealed class FakeStartupRegistration : IStartupRegistration
{
    public bool IsAvailable { get; set; } = true;

    public bool Succeeds { get; set; } = true;

    public List<bool> Applied { get; } = [];

    public bool TryApply(bool enabled)
    {
        Applied.Add(enabled);
        return Succeeds;
    }
}