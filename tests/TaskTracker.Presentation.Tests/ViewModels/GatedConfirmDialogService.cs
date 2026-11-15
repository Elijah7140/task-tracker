using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>A dialog service whose confirmation stays open until the test answers it.</summary>
internal sealed class GatedConfirmDialogService : IDialogService
{
    public int ConfirmCount { get; private set; }

    public TaskCompletionSource<bool> Answer { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public Task<bool> ConfirmAsync(string title, string message, string confirmText = "Continue",
        bool cancelIsDefault = false)
    {
        ConfirmCount++;
        return Answer.Task;
    }

    public Task<string?> PromptAsync(string title, string label, string? initialValue = null)
    {
        throw new NotSupportedException();
    }

    public Task<DraftDecision> ResolveDraftAsync()
    {
        throw new NotSupportedException();
    }

    public Task<FolderChoice?> PickFolderAsync(string title, IReadOnlyList<FolderChoice> folders,
        string label = "Move into", string confirmText = "Move")
    {
        throw new NotSupportedException();
    }

    public Task<int?> ChooseAsync(string title, string label, IReadOnlyList<string> options,
        string confirmText = "Choose")
    {
        throw new NotSupportedException();
    }

    public Task<bool> ShowImportPreviewAsync(CsvImportPreviewViewModel preview)
    {
        throw new NotSupportedException();
    }

    public Task ShowMessageAsync(string title, string message)
    {
        throw new NotSupportedException();
    }
}