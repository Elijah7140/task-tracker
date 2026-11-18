using System.Runtime.InteropServices;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>Unicode NOTIFYICONDATA including the fields used for a balloon.</summary>
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
internal struct NotifyIconData
{
    public uint Size;
    public nint Window;
    public uint Id;
    public uint Flags;
    public uint CallbackMessage;
    public nint Icon;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string Tip;

    public uint State;
    public uint StateMask;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string Body;

    public uint Version;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
    public string Title;

    public uint InfoFlags;
    public Guid ItemGuid;
    public nint BalloonIcon;
}