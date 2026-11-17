using System.Security;

using Avalonia.Threading;

using TaskTracker.Presentation.Reminders;

using Tmds.DBus.Protocol;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>Posts freedesktop notifications and follows their default action and close signals.</summary>
internal sealed class LinuxReminderNotifier(Action<Guid?> activate) : IReminderNotifier, IDisposable
{
    private const string InterfaceName = "org.freedesktop.Notifications";
    private const string Path = "/org/freedesktop/Notifications";
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(3);
    private readonly Dictionary<uint, Guid?> pending = [];
    private DBusConnection? connection;
    private IDisposable? actionWatch;
    private IDisposable? closeWatch;

    public async Task NotifyAsync(ReminderNotification notification, CancellationToken cancellationToken)
    {
        var bus = await GetConnectionAsync(cancellationToken);
        var message = BuildMessage(bus, notification);
        var reply = bus.CallMethodAsync(message, ReadId);
        var id = await reply.WaitAsync(Timeout, cancellationToken);
        pending[id] = notification.ItemId;
    }

    private async Task<DBusConnection> GetConnectionAsync(CancellationToken cancellationToken)
    {
        if (connection is not null)
        {
            return connection;
        }

        var address = DBusAddress.Session ?? throw new InvalidOperationException("No D-Bus session address.");
        var bus = new DBusConnection(address);
        connection = bus;
        await bus.ConnectAsync().AsTask().WaitAsync(Timeout, cancellationToken);
        actionWatch = await bus.WatchSignalAsync<(uint Id, string Key)>(InterfaceName, Path, InterfaceName, "ActionInvoked",
            ReadAction, OnAction, ObserverFlags.None, true).AsTask().WaitAsync(Timeout, cancellationToken);
        closeWatch = await bus.WatchSignalAsync<uint>(InterfaceName, Path, InterfaceName, "NotificationClosed",
            ReadId, OnClosed, ObserverFlags.None, true).AsTask().WaitAsync(Timeout, cancellationToken);
        return bus;
    }

    private static MessageBuffer BuildMessage(DBusConnection bus, ReminderNotification notification)
    {
        using var writer = bus.GetMessageWriter();
        writer.WriteMethodCallHeader(InterfaceName, Path, InterfaceName, "Notify", "susssasa{sv}i");
        writer.WriteString("Task Tracker");
        writer.WriteUInt32(0);
        writer.WriteString("appointment-soon");
        writer.WriteString(notification.Title.Replace('\0', ' '));
        writer.WriteString(SecurityElement.Escape(notification.Body.Replace('\0', ' ')));
        writer.WriteArray(new[] { "default", "Open" });
        writer.WriteDictionary(Array.Empty<KeyValuePair<string, VariantValue>>());
        writer.WriteInt32(-1);
        return writer.CreateMessage();
    }

    private static uint ReadId(Message message, object? state)
    {
        return message.GetBodyReader().ReadUInt32();
    }

    private static (uint Id, string Key) ReadAction(Message message, object? state)
    {
        var reader = message.GetBodyReader();
        return (reader.ReadUInt32(), reader.ReadString());
    }

    private void OnAction(Notification<(uint Id, string Key)> notification)
    {
        if (notification.HasValue && notification.Value.Key == "default"
            && pending.Remove(notification.Value.Id, out var item))
        {
            Dispatcher.UIThread.Post(() => activate(item));
        }
    }

    private void OnClosed(Notification<uint> notification)
    {
        if (notification.HasValue)
        {
            pending.Remove(notification.Value);
        }
    }

    public void Dispose()
    {
        closeWatch?.Dispose();
        actionWatch?.Dispose();
        connection?.Dispose();
    }
}