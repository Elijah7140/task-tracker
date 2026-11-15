using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Records launched addresses; <see cref="Result"/> decides whether the launch "worked".</summary>
internal sealed class FakeLinkLauncher : ILinkLauncher
{
    public List<Uri> Launched { get; } = [];

    public bool Result { get; set; } = true;

    public Task<bool> LaunchAsync(Uri uri)
    {
        Launched.Add(uri);
        return Task.FromResult(Result);
    }
}