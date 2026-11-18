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
    private const byte Acknowledgement = 1;

    private readonly Mutex mutex;
    private readonly string name;
    private readonly CancellationTokenSource stopping = new();
    private readonly Lock serverLock = new();
    private NamedPipeServerStream? currentServer;
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

    /// <summary>
    /// Asks the running instance to come forward and waits for its one-byte acknowledgement, so this
    /// launch only exits once the running instance has really seen the request.
    /// </summary>
    private static bool SignalRunningInstance(string name)
    {
        try
        {
            using var timeout = new CancellationTokenSource(SignalTimeout);
            using var client = new NamedPipeClientStream(".", name, PipeDirection.InOut,
                PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            client.ConnectAsync(timeout.Token).GetAwaiter().GetResult();
            var reply = new byte[1];
            var read = client.ReadAsync(reply, timeout.Token).AsTask().GetAwaiter().GetResult();
            return read == 1 && reply[0] == Acknowledgement;
        }
        catch (Exception exception) when (exception is OperationCanceledException or TimeoutException
            or IOException or UnauthorizedAccessException)
        {
            Trace.TraceWarning($"The running Task Tracker did not answer; starting another window: {exception.Message}");
            return false;
        }
    }

    /// <summary>
    /// Creates the first pipe before returning, so a second launch that starts straight away always
    /// finds it; waiting for connections then continues in the background.
    /// </summary>
    private void StartListening()
    {
        var firstServer = OpenServer();
        _ = Task.Run(() => ListenAsync(firstServer));
    }

    /// <summary>
    /// Creates the next pipe and remembers it, so <see cref="Dispose"/> can close it at once: on Linux
    /// the pipe name stays taken until its stream is closed.
    /// </summary>
    private NamedPipeServerStream OpenServer()
    {
        var server = new NamedPipeServerStream(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);

        lock (serverLock)
        {
            if (!disposed)
            {
                currentServer = server;
                return server;
            }
        }

        server.Dispose();
        throw new OperationCanceledException();
    }

    /// <summary>
    /// Serves one second launch at a time. Each pipe is closed after its connection and a new one is
    /// created for the next launch; a failure is logged and retried after a short delay.
    /// </summary>
    private async Task ListenAsync(NamedPipeServerStream firstServer)
    {
        NamedPipeServerStream? server = firstServer;
        while (!stopping.IsCancellationRequested)
        {
            try
            {
                server ??= OpenServer();
                await AcceptOneAsync(server);
            }
            catch (Exception exception) when (exception is OperationCanceledException or ObjectDisposedException)
            {
                return;
            }
            catch (IOException exception)
            {
                Trace.TraceWarning($"Single-instance pipe failed; retrying: {exception.Message}");
                await DelayBeforeRetryAsync();
            }

            server = null;
        }
    }

    /// <summary>
    /// Waits for one second launch on the given pipe, acknowledges it, raises the event and closes
    /// the pipe. The second launch waits for the acknowledgement, so it cannot close the pipe first.
    /// </summary>
    private async Task AcceptOneAsync(NamedPipeServerStream server)
    {
        await using (server)
        {
            await server.WaitForConnectionAsync(stopping.Token);
            await server.WriteAsync(new[] { Acknowledgement }, stopping.Token);
            await server.FlushAsync(stopping.Token);
            ActivationRequested?.Invoke();
        }
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

    /// <summary>Stops listening, closes the waiting pipe straight away and releases the name.</summary>
    public void Dispose()
    {
        NamedPipeServerStream? server;
        lock (serverLock)
        {
            if (disposed)
            {
                return;
            }

            disposed = true;
            server = currentServer;
            currentServer = null;
        }

        stopping.Cancel();
        server?.Dispose();
        mutex.Dispose();
    }
}