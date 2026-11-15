namespace TaskTracker.Presentation.Navigation;

/// <summary>Opens an address in the operating system's default handler, without tying ViewModels to a UI framework.</summary>
public interface ILinkLauncher
{
    /// <summary>
    /// Launches the address and returns whether it was handed to the system. Callers only pass addresses that
    /// <c>LinkPolicy</c> accepts (http, https, mailto); an implementation must not widen that.
    /// </summary>
    Task<bool> LaunchAsync(Uri uri);
}