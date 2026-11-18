using Avalonia.Headless.XUnit;
using Avalonia.Media.Imaging;

using SkiaSharp;

using TaskTracker.App.Desktop.Tray;

namespace TaskTracker.App.Desktop.Tests.Tray;

/// <summary>
/// Keeps <c>Assets/app.ico</c> (window, taskbar and exe icon) showing the same art as the tray icon.
/// Set TASKTRACKER_ACCEPT_SNAPSHOTS=1 to rebuild the file after changing <see cref="TrayIconArt"/>.
/// </summary>
public sealed class AppIconFileTests
{
    [AvaloniaFact]
    public void App_icon_file_shows_the_tray_icon_art_at_every_size()
    {
        var path = Path.Combine(SnapshotComparer.FindSolutionRoot(), "src", "TaskTracker.App.Desktop", "Assets", "app.ico");
        RebuildWhenApproving(path);

        var entries = ReadPngEntries(File.ReadAllBytes(path));

        Assert.Equal(AppIconFile.Sizes, entries.Keys.Order().ToArray());
        foreach (var (size, png) in entries)
        {
            AssertEntryMatchesArt(size, png);
        }
    }

    private static void RebuildWhenApproving(string path)
    {
        var approving = Environment.GetEnvironmentVariable("TASKTRACKER_ACCEPT_SNAPSHOTS") == "1";
        var inCi = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("CI"));

        if (approving && !inCi)
        {
            File.WriteAllBytes(path, AppIconFile.Build());
        }
    }

    /// <summary>Reads each directory entry of an .ico file, keyed by pixel size (0 means 256).</summary>
    private static Dictionary<int, byte[]> ReadPngEntries(byte[] file)
    {
        var entries = new Dictionary<int, byte[]>();
        var count = BitConverter.ToUInt16(file, 4);

        for (var index = 0; index < count; index++)
        {
            var entry = 6 + 16 * index;
            var size = file[entry] == 0 ? 256 : file[entry];
            var length = BitConverter.ToInt32(file, entry + 8);
            var offset = BitConverter.ToInt32(file, entry + 12);
            entries[size] = file.AsSpan(offset, length).ToArray();
        }

        return entries;
    }

    private static void AssertEntryMatchesArt(int size, byte[] png)
    {
        using var stored = SKBitmap.Decode(png);
        using var drawn = SKBitmap.Decode(Encode(TrayIconArt.Render(size)));

        Assert.NotNull(stored);
        Assert.Equal(size, stored.Width);
        var different = SnapshotComparer.CountDifferentPixels(stored, drawn);
        Assert.True(different <= size * size / 50, $"app.ico {size}px differs from the tray art in {different} pixels.");
    }

    private static byte[] Encode(RenderTargetBitmap bitmap)
    {
        using (bitmap)
        {
            using var encoded = new MemoryStream();
            bitmap.Save(encoded, new PngBitmapEncoderOptions());
            return encoded.ToArray();
        }
    }
}