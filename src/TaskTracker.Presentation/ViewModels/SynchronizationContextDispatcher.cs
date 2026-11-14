namespace TaskTracker.Presentation.ViewModels;

/// <summary>Uses the context captured when the workspace is created.</summary>
public sealed class SynchronizationContextDispatcher : IUiDispatcher
{
    private readonly SynchronizationContext? context;

    public SynchronizationContextDispatcher(SynchronizationContext? context)
    {
        this.context = context;
    }

    public void Post(Action action)
    {
        if (context is null)
        {
            action();
            return;
        }

        context.Post(_ => action(), null);
    }
}