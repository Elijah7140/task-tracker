namespace TaskTracker.Presentation.Installation;

/// <summary>Adds or removes the operating system entry that starts the app at sign-in (§7.13).</summary>
public interface IStartupRegistration
{
    /// <summary>True when the app is installed on an operating system that supports the entry.</summary>
    bool IsAvailable { get; }

    /// <summary>Writes the entry when enabled, otherwise removes it. Returns false if the system refused.</summary>
    bool TryApply(bool enabled);
}