using TaskTracker.Presentation.Navigation;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Records the addresses a view asked to open instead of starting a browser.</summary>
public sealed class FakeLinkLauncher : ILinkLauncher
{
    public List<Uri> Launched { get; } = [];

    public Task<bool> LaunchAsync(Uri uri)
    {
        Launched.Add(uri);
        return Task.FromResult(true);
    }
}