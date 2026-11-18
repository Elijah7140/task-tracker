using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Imaging;

namespace TaskTracker.App.Desktop.Tray;

/// <summary>
/// Draws the app icon: a checklist of three ticked lines on a blue tile. The tray draws it at run time;
/// <c>Assets/app.ico</c>, used by the window, the taskbar and the exe, is built from it by <see cref="AppIconFile"/>.
/// </summary>
internal static class TrayIconArt
{
    private const int Size = 64;
    private static readonly Color TileColor = Color.FromRgb(0x25, 0x63, 0xEB);

    public static WindowIcon Create()
    {
        var bitmap = Render();

        return new WindowIcon(bitmap);
    }

    /// <summary>Renders the icon at 64×64 pixels; the tray scales it down.</summary>
    public static RenderTargetBitmap Render()
    {
        return Render(Size);
    }

    /// <summary>Renders the icon at <paramref name="pixels"/> pixels square by scaling the 64-pixel design.</summary>
    public static RenderTargetBitmap Render(int pixels)
    {
        var scale = pixels / (double)Size;
        var bitmap = new RenderTargetBitmap(new PixelSize(pixels, pixels));
        using (var context = bitmap.CreateDrawingContext())
        using (context.PushTransform(Matrix.CreateScale(scale, scale)))
        {
            DrawTile(context);
            for (var row = 0; row < 3; row++)
            {
                DrawRow(context, 16 + row * 16);
            }
        }

        return bitmap;
    }

    private static void DrawTile(DrawingContext context)
    {
        var tile = new RoundedRect(new Rect(2, 2, Size - 4, Size - 4), 12);
        context.DrawRectangle(new SolidColorBrush(TileColor), null, tile);
    }

    /// <summary>Draws one checklist line: a tick on the left and a bar to its right.</summary>
    private static void DrawRow(DrawingContext context, double middle)
    {
        var pen = new Pen(Brushes.White, 5, lineCap: PenLineCap.Round, lineJoin: PenLineJoin.Round);
        var tick = new PolylineGeometry(
            [new Point(11, middle), new Point(16, middle + 4), new Point(24, middle - 5)], false);
        context.DrawGeometry(null, pen, tick);
        context.DrawLine(pen, new Point(31, middle), new Point(52, middle));
    }
}