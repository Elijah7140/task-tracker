using System.Runtime.InteropServices;

using Avalonia.Threading;

using TaskTracker.Presentation.Reminders;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>
/// Shows reminder balloons through one notification-area icon owned by the main window. The icon is
/// added once, stays hidden between balloons, and is deleted before the window is destroyed.
/// </summary>
internal sealed class WindowsReminderNotifier : IReminderNotifier, IDisposable
{
    private const uint IconId = 1;
    private const uint SubclassId = 1;
    private const uint CallbackMessage = 0x805A;

    private const uint NimAdd = 0;
    private const uint NimModify = 1;
    private const uint NimDelete = 2;
    private const uint NimSetVersion = 4;
    private const uint NifMessage = 0x0001;
    private const uint NifIcon = 0x0002;
    private const uint NifTip = 0x0004;
    private const uint NifState = 0x0008;
    private const uint NifInfo = 0x0010;
    private const uint NisHidden = 0x0001;
    private const uint NiifInfo = 0x0001;
    private const uint NotifyIconVersion4 = 4;

    private const uint BalloonHide = 0x0403;
    private const uint BalloonTimeout = 0x0404;
    private const uint BalloonClick = 0x0405;
    private const uint WmDestroy = 0x0002;
    private const uint WmTimeChange = 0x001E;
    private const uint WmGetIcon = 0x007F;
    private const uint WmPowerBroadcast = 0x0218;
    private const int PbtResumeAutomatic = 0x0012;
    private const int IdiApplication = 32512;

    private readonly nint window;
    private readonly Action<Guid?> activate;
    private readonly Action check;
    private readonly SubclassProcedure procedure;
    private readonly uint taskbarCreated;
    private Guid? balloonItem;
    private bool iconAdded;
    private bool disposed;

    public WindowsReminderNotifier(nint window, Action<Guid?> activate, Action check)
    {
        this.window = window;
        this.activate = activate;
        this.check = check;
        procedure = HandleMessage;
        taskbarCreated = RegisterWindowMessage("TaskbarCreated");
        if (!SetWindowSubclass(window, procedure, SubclassId, 0))
        {
            throw new InvalidOperationException("Could not attach the Windows notification callback.");
        }
    }

    /// <summary>Shows a balloon; clicking it opens the item of the latest balloon.</summary>
    public Task NotifyAsync(ReminderNotification notification, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (disposed)
        {
            return Task.CompletedTask;
        }

        EnsureIcon();
        var data = NewData();
        data.Flags = NifInfo | NifState;
        data.State = 0;
        data.StateMask = NisHidden;
        data.InfoFlags = NiifInfo;
        data.Title = Limit(notification.Title, 63);
        data.Body = Limit(notification.Body, 255);
        SendIcon(NimModify, ref data);
        balloonItem = notification.ItemId;
        return Task.CompletedTask;
    }

    private void EnsureIcon()
    {
        if (iconAdded)
        {
            return;
        }

        var data = NewData();
        data.Flags = NifMessage | NifIcon | NifTip | NifState;
        data.CallbackMessage = CallbackMessage;
        data.Icon = WindowIcon();
        data.State = NisHidden;
        data.StateMask = NisHidden;
        SendIcon(NimAdd, ref data);
        iconAdded = true;
        data.Version = NotifyIconVersion4;
        SendIcon(NimSetVersion, ref data);
    }

    private nint WindowIcon()
    {
        var icon = SendMessage(window, WmGetIcon, 0, 0);
        return icon != 0 ? icon : LoadIcon(0, IdiApplication);
    }

    private nint HandleMessage(nint handle, uint message, nuint word, nint data, nuint subclassId, nuint reference)
    {
        if (message == CallbackMessage)
        {
            HandleBalloon((uint)data);
        }
        else if (message == WmTimeChange || (message == WmPowerBroadcast && word == PbtResumeAutomatic))
        {
            check();
        }
        else if (message == WmDestroy)
        {
            Dispose();
        }
        else if (taskbarCreated != 0 && message == taskbarCreated)
        {
            iconAdded = false;
        }

        return DefSubclassProc(handle, message, word, data);
    }

    /// <summary>With version 4 callbacks the low word is the event and the high word the icon id.</summary>
    private void HandleBalloon(uint data)
    {
        var action = data & 0xFFFF;
        if (data >> 16 != IconId || action is not (BalloonHide or BalloonTimeout or BalloonClick))
        {
            return;
        }

        HideIcon();
        if (action == BalloonClick)
        {
            var item = balloonItem;
            Dispatcher.UIThread.Post(() => activate(item));
        }
    }

    private void HideIcon()
    {
        var data = NewData();
        data.Flags = NifState;
        data.State = NisHidden;
        data.StateMask = NisHidden;
        ShellNotifyIcon(NimModify, ref data);
    }

    private NotifyIconData NewData()
    {
        return new NotifyIconData
        {
            Size = (uint)Marshal.SizeOf<NotifyIconData>(),
            Window = window,
            Id = IconId,
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

    private static void SendIcon(uint operation, ref NotifyIconData data)
    {
        if (!ShellNotifyIcon(operation, ref data))
        {
            throw new InvalidOperationException("The Windows notification area did not accept the reminder.");
        }
    }

    /// <summary>Deletes the icon and detaches from the window. Safe to call more than once.</summary>
    public void Dispose()
    {
        if (disposed)
        {
            return;
        }

        disposed = true;
        if (iconAdded)
        {
            var data = NewData();
            ShellNotifyIcon(NimDelete, ref data);
            iconAdded = false;
        }

        RemoveWindowSubclass(window, procedure, SubclassId);
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