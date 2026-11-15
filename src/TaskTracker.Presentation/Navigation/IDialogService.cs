using TaskTracker.Presentation.ViewModels;

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

    /// <summary>Asks the user to pick a folder; <paramref name="label"/> and <paramref name="confirmText"/> say what for.</summary>
    Task<FolderChoice?> PickFolderAsync(string title, IReadOnlyList<FolderChoice> folders,
        string label = "Move into", string confirmText = "Move");

    /// <summary>Asks the user to pick one of several named options; returns its index, or null when cancelled.</summary>
    Task<int?> ChooseAsync(string title, string label, IReadOnlyList<string> options, string confirmText = "Choose");

    /// <summary>
    /// Shows what a CSV import would do and returns true when the user chooses to import. A preview with
    /// problems offers no import button, so it always returns false.
    /// </summary>
    Task<bool> ShowImportPreviewAsync(CsvImportPreviewViewModel preview);

    Task ShowMessageAsync(string title, string message);
}