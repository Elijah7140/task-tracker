using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Runs posted work at once, so timer ticks take effect inside the test.</summary>
internal sealed class ImmediateDispatcher : IUiDispatcher
{
    public void Post(Action action)
    {
        action();
    }
}