using Avalonia.Media.Imaging;

namespace TaskTracker.App.Desktop.Tray;

/// <summary>Builds the contents of <c>Assets/app.ico</c> from <see cref="TrayIconArt"/>, one PNG entry per size.</summary>
internal static class AppIconFile
{
    /// <summary>The sizes Windows asks for in the taskbar, title bar, Explorer and shortcuts.</summary>
    public static readonly int[] Sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

    private const int HeaderLength = 6;
    private const int EntryLength = 16;

    /// <summary>Returns a complete .ico file holding the icon at every size in <see cref="Sizes"/>.</summary>
    public static byte[] Build()
    {
        var images = Sizes.Select(EncodePng).ToList();
        using var file = new MemoryStream();
        using var writer = new BinaryWriter(file);

        WriteHeader(writer);
        WriteDirectory(writer, images);
        foreach (var image in images)
        {
            writer.Write(image);
        }

        writer.Flush();
        return file.ToArray();
    }

    private static byte[] EncodePng(int size)
    {
        using var bitmap = TrayIconArt.Render(size);
        using var encoded = new MemoryStream();
        bitmap.Save(encoded, new PngBitmapEncoderOptions());
        return encoded.ToArray();
    }

    private static void WriteHeader(BinaryWriter writer)
    {
        writer.Write((ushort)0);
        writer.Write((ushort)1);
        writer.Write((ushort)Sizes.Length);
    }

    /// <summary>Writes one directory entry per image; a size of 256 is stored as 0, as the format requires.</summary>
    private static void WriteDirectory(BinaryWriter writer, IReadOnlyList<byte[]> images)
    {
        var offset = HeaderLength + EntryLength * images.Count;

        for (var index = 0; index < images.Count; index++)
        {
            var dimension = (byte)(Sizes[index] % 256);
            writer.Write(dimension);
            writer.Write(dimension);
            writer.Write((byte)0);
            writer.Write((byte)0);
            writer.Write((ushort)1);
            writer.Write((ushort)32);
            writer.Write(images[index].Length);
            writer.Write(offset);
            offset += images[index].Length;
        }
    }
}