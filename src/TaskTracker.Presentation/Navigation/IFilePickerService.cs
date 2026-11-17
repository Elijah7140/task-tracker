namespace TaskTracker.Presentation.Navigation;

/// <summary>Asks the user to choose a file, without tying ViewModels to a UI framework.</summary>
public interface IFilePickerService
{
    /// <summary>Asks where to save a file; returns its path, or null when the user cancels.</summary>
    Task<string?> PickSavePathAsync(string title, string suggestedFileName, TransferFileKind kind);

    /// <summary>Asks which existing file to open; returns its path, or null when the user cancels.</summary>
    Task<string?> PickOpenPathAsync(string title, TransferFileKind kind);
}