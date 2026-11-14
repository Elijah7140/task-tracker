using Avalonia.Media.Imaging;

using SkiaSharp;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Compares rendered frames with approved per-platform PNG files.</summary>
public static class SnapshotComparer
{
    private const int ChannelTolerance = 12;
    private const double MaximumDifferentPixelRatio = 0.002;

    /// <summary>Checks a rendered frame against its approved image, writing a received image on failure.</summary>
    public static void AssertMatches(Bitmap frame, string name)
    {
        var directory = FindSnapshotDirectory();
        Directory.CreateDirectory(directory);
        var platform = OperatingSystem.IsWindows() ? "windows" : "linux";
        var baselinePath = Path.Combine(directory, $"{name}.{platform}.png");
        var receivedPath = Path.Combine(directory, $"{name}.{platform}.received.png");
        var received = Encode(frame);

        if (Environment.GetEnvironmentVariable("TASKTRACKER_ACCEPT_SNAPSHOTS") == "1")
        {
            Approve(baselinePath, received);
            return;
        }

        Verify(baselinePath, receivedPath, received, name);
    }

    private static byte[] Encode(Bitmap frame)
    {
        using var encoded = new MemoryStream();
        frame.Save(encoded, new PngBitmapEncoderOptions());
        return encoded.ToArray();
    }

    private static void Approve(string baselinePath, byte[] received)
    {
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("CI")) ||
            !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("GITHUB_ACTIONS")))
        {
            Assert.Fail("Snapshot approval is disabled in CI. Review and approve images on a development machine.");
        }

        File.WriteAllBytes(baselinePath, received);
    }

    private static void Verify(string baselinePath, string receivedPath, byte[] received, string name)
    {
        if (!File.Exists(baselinePath))
        {
            FailWithReceived(receivedPath, received,
                $"Missing snapshot {baselinePath}. Review the received image and set TASKTRACKER_ACCEPT_SNAPSHOTS=1 to approve.");
        }

        using var baselineImage = SKBitmap.Decode(baselinePath);
        using var receivedImage = SKBitmap.Decode(received);
        Assert.NotNull(baselineImage);
        Assert.NotNull(receivedImage);
        var sameSize = baselineImage.Width == receivedImage.Width && baselineImage.Height == receivedImage.Height;

        if (!sameSize)
        {
            FailWithReceived(receivedPath, received,
                $"Snapshot {name} size differs: expected {baselineImage.Width}x{baselineImage.Height}, " +
                $"received {receivedImage.Width}x{receivedImage.Height}.");
        }

        VerifyPixels(baselineImage, receivedImage, receivedPath, received, name);
    }

    private static void VerifyPixels(SKBitmap baseline, SKBitmap actual, string receivedPath, byte[] received, string name)
    {
        var differentPixels = CountDifferentPixels(baseline, actual);
        var ratio = (double)differentPixels / (baseline.Width * baseline.Height);

        if (ratio > MaximumDifferentPixelRatio)
        {
            FailWithReceived(receivedPath, received,
                $"Snapshot {name} differs in {differentPixels} pixels ({ratio:P3}); allowed {MaximumDifferentPixelRatio:P3}.");
        }

        if (File.Exists(receivedPath))
        {
            File.Delete(receivedPath);
        }
    }

    private static void FailWithReceived(string path, byte[] received, string message)
    {
        File.WriteAllBytes(path, received);
        Assert.Fail($"{message} Received: {path}");
    }

    private static int CountDifferentPixels(SKBitmap baseline, SKBitmap received)
    {
        var different = 0;

        for (var row = 0; row < baseline.Height; row++)
        {
            for (var column = 0; column < baseline.Width; column++)
            {
                var expected = baseline.GetPixel(column, row);
                var actual = received.GetPixel(column, row);
                var difference = Math.Max(Math.Abs(expected.Red - actual.Red),
                    Math.Max(Math.Abs(expected.Green - actual.Green), Math.Abs(expected.Blue - actual.Blue)));

                if (difference > ChannelTolerance || expected.Alpha != actual.Alpha)
                {
                    different++;
                }
            }
        }

        return different;
    }

    private static string FindSnapshotDirectory()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "TaskTracker.slnx")))
        {
            directory = directory.Parent;
        }

        return Path.Combine(directory?.FullName ?? throw new InvalidOperationException("Solution root unavailable."),
            "tests", "TaskTracker.App.Desktop.Tests", "Snapshots");
    }
}