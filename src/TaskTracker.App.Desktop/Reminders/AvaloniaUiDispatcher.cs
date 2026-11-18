using Avalonia.Threading;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>Dispatches reminder timer and data-save signals to Avalonia's UI thread.</summary>
internal sealed class AvaloniaUiDispatcher : IUiDispatcher
{
    public void Post(Action action)
    {
        Dispatcher.UIThread.Post(action);
    }
}