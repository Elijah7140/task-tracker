using Avalonia;

namespace TaskTracker.App.Desktop;

internal static class Program
{
    // Avalonia, third-party APIs and SynchronizationContext-reliant code must not be used
    // before AppMain is called: nothing is initialized yet.
    [STAThread]
    public static void Main(string[] args) => BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);

    // Also used by the visual designer; keep it public and parameterless.
    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UsePlatformDetect()
#if DEBUG
            .WithDeveloperTools()
#endif
            .WithInterFont()
            .LogToTrace();
}