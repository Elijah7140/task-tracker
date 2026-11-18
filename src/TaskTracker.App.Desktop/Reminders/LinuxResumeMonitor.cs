using System.Diagnostics;

using Tmds.DBus.Protocol;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>Requests a check immediately after a logind resume, where logind is available.</summary>
internal sealed class LinuxResumeMonitor(Action check) : IDisposable
{
    private IDisposable? watch;
    private bool disposed;

    public async Task StartAsync()
    {
        try
        {
            var listener = await DBusConnection.System.WatchSignalAsync<bool>(
                "org.freedesktop.login1", "/org/freedesktop/login1", "org.freedesktop.login1.Manager",
                "PrepareForSleep", ReadSleeping, OnSignal, ObserverFlags.None, false)
                .AsTask().WaitAsync(TimeSpan.FromSeconds(3));
            if (disposed)
            {
                listener.Dispose();
            }
            else
            {
                watch = listener;
            }
        }
        catch (Exception exception)
        {
            Trace.TraceInformation($"Resume signal unavailable: {exception.Message}");
        }
    }

    private static bool ReadSleeping(Message message, object? state)
    {
        return message.GetBodyReader().ReadBool();
    }

    private void OnSignal(Notification<bool> signal)
    {
        if (signal.HasValue && !signal.Value)
        {
            check();
        }
    }

    public void Dispose()
    {
        disposed = true;
        watch?.Dispose();
    }
}