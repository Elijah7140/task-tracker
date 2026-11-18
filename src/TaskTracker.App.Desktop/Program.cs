using Avalonia;

using TaskTracker.App.Desktop.SingleInstance;

namespace TaskTracker.App.Desktop;

internal static class Program
{
    // Avalonia, third-party APIs and SynchronizationContext-reliant code must not be used
    // before AppMain is called: nothing is initialized yet.
    [STAThread]
    public static void Main(string[] args)
    {
        using var guard = SingleInstanceGuard.Acquire(CompositionRoot.ResolveDatabasePath(), Environment.UserName);
        if (guard is null)
        {
            return;
        }

        BuildAvaloniaApp(guard).StartWithClassicDesktopLifetime(args);
    }

    // Also used by the visual designer; keep it public and parameterless.
    public static AppBuilder BuildAvaloniaApp()
    {
        return BuildAvaloniaApp(null);
    }

    private static AppBuilder BuildAvaloniaApp(SingleInstanceGuard? guard)
    {
        return AppBuilder.Configure(() => new App { InstanceGuard = guard })
            .UsePlatformDetect()
#if DEBUG
            .WithDeveloperTools()
#endif
            .WithInterFont()
            .LogToTrace();
    }
}