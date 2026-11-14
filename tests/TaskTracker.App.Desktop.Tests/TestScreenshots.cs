using Avalonia.Media.Imaging;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Exports optional screenshots without affecting baseline approval.</summary>
public static class TestScreenshots
{
    /// <summary>Writes an optional PNG when TASKTRACKER_SCREENSHOT_DIR is set.</summary>
    public static void SaveIfRequested(Bitmap frame, string fileName)
    {
        var directory = Environment.GetEnvironmentVariable("TASKTRACKER_SCREENSHOT_DIR");
        if (string.IsNullOrEmpty(directory))
        {
            return;
        }

        Directory.CreateDirectory(directory);
        frame.Save(Path.Combine(directory, fileName), new PngBitmapEncoderOptions());
    }
}