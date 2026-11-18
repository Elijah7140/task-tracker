using System.Runtime.InteropServices;

using Avalonia;

namespace TaskTracker.App.Desktop.Tray;

/// <summary>Reads the mouse position where the platform allows it.</summary>
internal static class CursorPosition
{
    /// <summary>The cursor in physical screen pixels on Windows; null elsewhere or when the call fails.</summary>
    public static PixelPoint? TryGet()
    {
        if (!OperatingSystem.IsWindows() || !GetCursorPos(out var point))
        {
            return null;
        }

        return new PixelPoint(point.X, point.Y);
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetCursorPos(out NativePoint point);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint
    {
        public int X;
        public int Y;
    }
}