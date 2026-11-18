using System.Diagnostics;
using System.Security;

using TaskTracker.Presentation.Installation;

namespace TaskTracker.App.Desktop.Installation;

/// <summary>Applies the <c>StartWithSystem</c> setting to this operating system's entry, when there is one.</summary>
internal sealed class StartupRegistration : IStartupRegistration
{
    private readonly IStartupEntry? entry;

    /// <param name="entry">The entry for this OS, or null when the app is not installed or the OS is unsupported.</param>
    public StartupRegistration(IStartupEntry? entry)
    {
        this.entry = entry;
    }

    /// <inheritdoc />
    public bool IsAvailable => entry is not null;

    /// <inheritdoc />
    public bool TryApply(bool enabled)
    {
        if (entry is null)
        {
            return false;
        }

        try
        {
            Apply(entry, enabled);
            return true;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or SecurityException)
        {
            Trace.TraceWarning($"Could not update the start-with-system entry: {exception}");
            return false;
        }
    }

    private static void Apply(IStartupEntry entry, bool enabled)
    {
        if (enabled)
        {
            entry.Write();
        }
        else
        {
            entry.Remove();
        }
    }
}