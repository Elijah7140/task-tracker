using System.Diagnostics;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;

namespace TaskTracker.App.Desktop.SingleInstance;

/// <summary>
/// Allows one running app per user and database (§7.12). The first instance holds a named mutex
/// and listens on a named pipe; a second launch connects to that pipe, which brings the running
/// window forward, and then exits. Different databases (tests, smoke runs) never share a name.
/// </summary>
internal sealed class SingleInstanceGuard : IDisposable
{
    private static readonly TimeSpan SignalTimeout = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan ListenRetryDelay = TimeSpan.FromSeconds(1);

    private readonly Mutex mutex;
    private readonly string name;
    private readonly CancellationTokenSource stopping = new();
    private bool disposed;

    private SingleInstanceGuard(Mutex mutex, string name)
    {
        this.mutex = mutex;
        this.name = name;
    }

    /// <summary>Raised on a background thread when another launch asks this instance to come forward.</summary>
    public event Action? ActivationRequested;

    /// <summary>
    /// Returns the guard of this instance, or null when an already running instance accepted the
    /// request to come forward and this launch should exit. When the running instance does not
    /// answer (it is still starting, or stuck), this launch runs as before rather than vanish.
    /// </summary>
    public static SingleInstanceGuard? Acquire(string databasePath, string userName)
    {
        var name = InstanceName(databasePath, userName);
        var mutex = new Mutex(false, MutexName(name), out var createdNew);
        if (!createdNew && SignalRunningInstance(name))
        {
            mutex.Dispose();
            return null;
        }

        var guard = new SingleInstanceGuard(mutex, name);
        if (createdNew)
        {
            guard.StartListening();
        }

        return guard;
    }

    /// <summary>A short name derived from the user and the full database path, safe for mutexes and pipes.</summary>
    public static string InstanceName(string databasePath, string userName)
    {
        var path = Path.GetFullPath(databasePath);
        if (OperatingSystem.IsWindows())
        {
            path = path.ToUpperInvariant();
        }

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{userName}\n{path}"));
        return "TaskTracker-" + Convert.ToHexStringLower(hash.AsSpan(0, 16));
    }

    private static string MutexName(string name)
    {
        return @"Local\" + name;
    }

    private static bool SignalRunningInstance(string name)
    {
        try
        {
            using var client = new NamedPipeClientStream(".", name, PipeDirection.Out, PipeOptions.CurrentUserOnly);
            client.Connect(SignalTimeout);
            return true;
        }
        catch (Exception exception) when (exception is TimeoutException or IOException or UnauthorizedAccessException)
        {
            Trace.TraceWarning($"The running Task Tracker did not answer; starting another window: {exception.Message}");
            return false;
        }
    }

    private void StartListening()
    {
        _ = Task.Run(ListenAsync);
    }

    private async Task ListenAsync()
    {
        while (!stopping.IsCancellationRequested)
        {
            try
            {
                await AcceptOneAsync();
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (IOException exception)
            {
                Trace.TraceWarning($"Single-instance pipe failed; retrying: {exception.Message}");
                await DelayBeforeRetryAsync();
            }
        }
    }

    private async Task AcceptOneAsync()
    {
        await using var server = new NamedPipeServerStream(name, PipeDirection.In, 1, PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        await server.WaitForConnectionAsync(stopping.Token);
        ActivationRequested?.Invoke();
    }

    private async Task DelayBeforeRetryAsync()
    {
        try
        {
            await Task.Delay(ListenRetryDelay, stopping.Token);
        }
        catch (OperationCanceledException)
        {
            // Disposal ends the loop at its next check.
        }
    }

    public void Dispose()
    {
        if (disposed)
        {
            return;
        }

        disposed = true;
        stopping.Cancel();
        mutex.Dispose();
    }
}