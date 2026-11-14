namespace TaskTracker.Presentation.Navigation;

/// <summary>Requests user input without tying ViewModels to a UI framework.</summary>
public interface IDialogService
{
    Task<string?> PromptAsync(string title, string label, string? initialValue = null);

    Task<bool> ConfirmAsync(string title, string message, string confirmText = "Continue");

    Task<DraftDecision> ResolveDraftAsync();

    Task<FolderChoice?> PickFolderAsync(string title, IReadOnlyList<FolderChoice> folders);

    Task ShowMessageAsync(string title, string message);
}