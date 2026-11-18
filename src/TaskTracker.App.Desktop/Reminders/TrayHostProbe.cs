using System.Diagnostics;

using Tmds.DBus.Protocol;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>
/// Tells whether the desktop will really show a notification-area icon. Windows and macOS always
/// have one; on Linux the icon needs a StatusNotifierWatcher on the session bus.
/// </summary>
internal static class TrayHostProbe
{
    private const string BusName = "org.freedesktop.DBus";
    private const string BusPath = "/org/freedesktop/DBus";
    private const string WatcherName = "org.kde.StatusNotifierWatcher";
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(2);

    public static async Task<bool> IsAvailableAsync()
    {
        if (OperatingSystem.IsWindows() || OperatingSystem.IsMacOS())
        {
            return true;
        }

        return OperatingSystem.IsLinux() && await HasStatusNotifierWatcherAsync();
    }

    private static async Task<bool> HasStatusNotifierWatcherAsync()
    {
        if (DBusAddress.Session is not { } address)
        {
            return false;
        }

        try
        {
            using var bus = new DBusConnection(address);
            await bus.ConnectAsync().AsTask().WaitAsync(Timeout);
            return await bus.CallMethodAsync(BuildNameHasOwner(bus), ReadBool).WaitAsync(Timeout);
        }
        catch (Exception exception)
        {
            Trace.TraceWarning($"Could not look for a tray host: {exception.Message}");
            return false;
        }
    }

    private static MessageBuffer BuildNameHasOwner(DBusConnection bus)
    {
        using var writer = bus.GetMessageWriter();
        writer.WriteMethodCallHeader(BusName, BusPath, BusName, "NameHasOwner", "s");
        writer.WriteString(WatcherName);
        return writer.CreateMessage();
    }

    private static bool ReadBool(Message message, object? state)
    {
        return message.GetBodyReader().ReadBool();
    }
}