using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.Tests.ViewModels;

internal sealed class FakeDialogService : IDialogService
{
    public string? PromptResult { get; set; }

    public bool ConfirmResult { get; set; }

    public FolderChoice? FolderResult { get; set; }

    public List<string> Messages { get; } = [];

    public Task<string?> PromptAsync(string title, string label, string? initialValue = null)
    {
        return Task.FromResult(PromptResult);
    }

    public Task<bool> ConfirmAsync(string title, string message)
    {
        return Task.FromResult(ConfirmResult);
    }

    public Task<FolderChoice?> PickFolderAsync(string title, IReadOnlyList<FolderChoice> folders)
    {
        return Task.FromResult(FolderResult);
    }

    public Task ShowMessageAsync(string title, string message)
    {
        Messages.Add(message);
        return Task.CompletedTask;
    }
}