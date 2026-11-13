using Avalonia;
using Avalonia.Headless;

using TaskTracker.App.Desktop;
using TaskTracker.App.Desktop.Tests;

[assembly: AvaloniaTestApplication(typeof(TestAppBuilder))]

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Boots the real <see cref="App"/> on Avalonia's headless platform with Skia rendering.</summary>
public static class TestAppBuilder
{
    public static AppBuilder BuildAvaloniaApp()
    {
        var databasePath = Path.Combine(Path.GetTempPath(), $"tasktracker-ui-test-{Guid.CreateVersion7()}.db");
        Environment.SetEnvironmentVariable("TASKTRACKER_DB_PATH", databasePath);

        return AppBuilder.Configure<App>()
            .UseSkia()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions { UseHeadlessDrawing = false });
    }
}