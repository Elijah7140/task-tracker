using Avalonia.Headless;
using Avalonia.Headless.XUnit;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

public sealed class MainWindowTests
{
    [AvaloniaFact]
    public void Main_window_renders_with_its_title()
    {
        var window = new MainWindow { DataContext = new MainWindowViewModel() };

        window.Show();
        using var frame = window.CaptureRenderedFrame();

        Assert.Equal("Task Tracker", window.Title);
        Assert.NotNull(frame);
        SaveScreenshotIfRequested(frame!, "main-window.png");
    }

    /// <summary>Writes the frame to $TASKTRACKER_SCREENSHOT_DIR when that variable is set.</summary>
    private static void SaveScreenshotIfRequested(Avalonia.Media.Imaging.Bitmap frame, string fileName)
    {
        var directory = Environment.GetEnvironmentVariable("TASKTRACKER_SCREENSHOT_DIR");
        if (!string.IsNullOrEmpty(directory))
        {
            frame.Save(Path.Combine(directory, fileName), new Avalonia.Media.Imaging.PngBitmapEncoderOptions());
        }
    }
}