using System.Runtime.InteropServices;

using Avalonia.Threading;

using TaskTracker.Presentation.Reminders;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>Posts Shell_NotifyIcon balloons and routes their callbacks through the existing HWND.</summary>
internal sealed class WindowsReminderNotifier : IReminderNotifier, IDisposable
{
    private const uint Add = 0;
    private const uint Modify = 1;
    private const uint Delete = 2;
    private const uint SetVersion = 4;
    private const uint CallbackMessage = 0x805A;
    private const uint BalloonHide = 0x0403;
    private const uint BalloonTimeout = 0x0404;
    private const uint BalloonClick = 0x0405;
    private const uint TimeChange = 0x001E;
    private const uint PowerBroadcast = 0x0218;
    private const int ResumeAutomatic = 0x0012;

    private readonly nint window;
    private readonly Action<Guid?> activate;
    private readonly Action check;
    private readonly SubclassProcedure procedure;
    private readonly uint taskbarCreated;
    private readonly Dictionary<uint, Guid?> pending = [];
    private ushort lastId;

    public WindowsReminderNotifier(nint window, Action<Guid?> activate, Action check)
    {
        this.window = window;
        this.activate = activate;
        this.check = check;
        procedure = HandleMessage;
        taskbarCreated = RegisterWindowMessage("TaskbarCreated");
        if (!SetWindowSubclass(window, procedure, 1, 0))
        {
            throw new InvalidOperationException("Could not attach the Windows notification callback.");
        }
    }

    public Task NotifyAsync(ReminderNotification notification, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var id = NextId();
        var icon = MakeIcon(id);
        icon.Flags = 0x0001 | 0x0002 | 0x0004; // NIF_MESSAGE | NIF_ICON | NIF_TIP
        icon.CallbackMessage = CallbackMessage;
        icon.Icon = SendMessage(window, 0x007F, 0, 0); // WM_GETICON, ICON_SMALL
        if (icon.Icon == 0)
        {
            icon.Icon = LoadIcon(0, 32512); // IDI_APPLICATION
        }

        SendIcon(Add, ref icon);
        pending.Add(id, notification.ItemId);
        try
        {
            ShowBalloon(ref icon, notification);
        }
        catch
        {
            RemoveIcon(id);
            throw;
        }

        return Task.CompletedTask;
    }

    private static void ShowBalloon(ref NotifyIconData icon, ReminderNotification notification)
    {
        icon.Version = 4;
        SendIcon(SetVersion, ref icon);
        icon.Flags = 0x0010; // NIF_INFO
        icon.InfoFlags = 1; // NIIF_INFO
        icon.Title = Limit(notification.Title, 63);
        icon.Body = Limit(notification.Body, 255);
        SendIcon(Modify, ref icon);
    }

    private uint NextId()
    {
        do
        {
            lastId++;
        }
        while (lastId == 0 || pending.ContainsKey(lastId));

        return lastId;
    }

    private nint HandleMessage(nint handle, uint message, nuint word, nint data, nuint subclassId, nuint reference)
    {
        if (message == CallbackMessage)
        {
            HandleBalloon((uint)data);
        }
        else if (message == TimeChange || (message == PowerBroadcast && word == ResumeAutomatic))
        {
            check();
        }
        else if (taskbarCreated != 0 && message == taskbarCreated)
        {
            pending.Clear();
        }

        return DefSubclassProc(handle, message, word, data);
    }

    private void HandleBalloon(uint data)
    {
        var id = data >> 16;
        var action = data & 0xFFFF;
        if (action is not (BalloonHide or BalloonTimeout or BalloonClick) || !pending.TryGetValue(id, out var item))
        {
            return;
        }

        RemoveIcon(id);
        if (action == BalloonClick)
        {
            Dispatcher.UIThread.Post(() => activate(item));
        }
    }

    private void RemoveIcon(uint id)
    {
        pending.Remove(id);
        var icon = MakeIcon(id);
        ShellNotifyIcon(Delete, ref icon);
    }

    private NotifyIconData MakeIcon(uint id)
    {
        return new NotifyIconData
        {
            Size = (uint)Marshal.SizeOf<NotifyIconData>(),
            Window = window,
            Id = id,
            Tip = "Task Tracker",
            Body = string.Empty,
            Title = string.Empty,
        };
    }

    private static string Limit(string value, int length)
    {
        var text = value.Replace('\0', ' ');
        if (text.Length <= length)
        {
            return text;
        }

        return text[..(char.IsHighSurrogate(text[length - 1]) ? length - 1 : length)];
    }

    private static void SendIcon(uint operation, ref NotifyIconData icon)
    {
        if (!ShellNotifyIcon(operation, ref icon))
        {
            throw new InvalidOperationException("The Windows notification area did not accept the reminder.");
        }
    }

    public void Dispose()
    {
        foreach (var id in pending.Keys.ToArray())
        {
            RemoveIcon(id);
        }

        RemoveWindowSubclass(window, procedure, 1);
    }

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate nint SubclassProcedure(nint window, uint message, nuint word, nint data,
        nuint subclassId, nuint reference);

    [DllImport("shell32.dll", EntryPoint = "Shell_NotifyIconW", CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShellNotifyIcon(uint operation, ref NotifyIconData data);

    [DllImport("comctl32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowSubclass(nint window, SubclassProcedure callback, nuint id, nuint reference);

    [DllImport("comctl32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RemoveWindowSubclass(nint window, SubclassProcedure callback, nuint id);

    [DllImport("comctl32.dll")]
    private static extern nint DefSubclassProc(nint window, uint message, nuint word, nint data);

    [DllImport("user32.dll", EntryPoint = "RegisterWindowMessageW", CharSet = CharSet.Unicode)]
    private static extern uint RegisterWindowMessage(string name);

    [DllImport("user32.dll", EntryPoint = "LoadIconW")]
    private static extern nint LoadIcon(nint instance, nint name);

    [DllImport("user32.dll", EntryPoint = "SendMessageW")]
    private static extern nint SendMessage(nint window, uint message, nuint word, nint data);
}