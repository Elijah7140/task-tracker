namespace TaskTracker.Presentation.Navigation;

/// <summary>Requests user input without tying ViewModels to a UI framework.</summary>
public interface IDialogService
{
    Task<string?> PromptAsync(string title, string label, string? initialValue = null);

    /// <summary>
    /// Asks the user to confirm. With <paramref name="cancelIsDefault"/> the Cancel button is the default and
    /// has focus, so a stray Enter cannot confirm; use it for irreversible actions.
    /// </summary>
    Task<bool> ConfirmAsync(string title, string message, string confirmText = "Continue", bool cancelIsDefault = false);

    Task<DraftDecision> ResolveDraftAsync();

    Task<FolderChoice?> PickFolderAsync(string title, IReadOnlyList<FolderChoice> folders);

    Task ShowMessageAsync(string title, string message);
}