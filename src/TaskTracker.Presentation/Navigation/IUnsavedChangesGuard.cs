namespace TaskTracker.Presentation.Navigation;

/// <summary>A page that asks before its unsaved changes are thrown away.</summary>
public interface IUnsavedChangesGuard
{
    /// <summary>
    /// Returns true when the page has no unsaved changes or the user resolved them
    /// (saved or discarded); returns false when the user chose to stay.
    /// </summary>
    Task<bool> ConfirmLeaveAsync();
}