using System.Runtime.Versioning;

using Microsoft.Win32;

namespace TaskTracker.App.Desktop.Installation;

/// <summary>The real <c>HKCU\Software\Microsoft\Windows\CurrentVersion\Run</c> key.</summary>
[SupportedOSPlatform("windows")]
internal sealed class WindowsRunKey : IRunKey
{
    private const string KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";

    /// <inheritdoc />
    public void SetValue(string name, string command)
    {
        using var key = Registry.CurrentUser.CreateSubKey(KeyPath);
        key.SetValue(name, command, RegistryValueKind.String);
    }

    /// <inheritdoc />
    public void DeleteValue(string name)
    {
        using var key = Registry.CurrentUser.OpenSubKey(KeyPath, writable: true);
        key?.DeleteValue(name, throwOnMissingValue: false);
    }
}