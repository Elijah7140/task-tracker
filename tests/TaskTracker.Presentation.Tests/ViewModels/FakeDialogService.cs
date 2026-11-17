using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.Tests.ViewModels;

internal sealed class FakeDialogService : IDialogService
{
    public string? PromptResult { get; set; }

    public bool ConfirmResult { get; set; }

    public DraftDecision DraftResult { get; set; } = DraftDecision.Cancel;

    public FolderChoice? FolderResult { get; set; }

    public int DraftPromptCount { get; private set; }

    /// <summary>When set, the draft question stays open until the test completes it.</summary>
    public TaskCompletionSource<DraftDecision>? DraftGate { get; set; }

    public List<string> Messages { get; } = [];

    public List<string> ConfirmTitles { get; } = [];

    public List<string> ConfirmMessages { get; } = [];

    public List<bool> CancelDefaults { get; } = [];

    public Task<string?> PromptAsync(string title, string label, string? initialValue = null)
    {
        return Task.FromResult(PromptResult);
    }

    public Task<bool> ConfirmAsync(string title, string message, string confirmText = "Continue",
        bool cancelIsDefault = false)
    {
        ConfirmTitles.Add(title);
        ConfirmMessages.Add(message);
        CancelDefaults.Add(cancelIsDefault);

        return Task.FromResult(ConfirmResult);
    }

    public Task<DraftDecision> ResolveDraftAsync()
    {
        DraftPromptCount++;

        return DraftGate?.Task ?? Task.FromResult(DraftResult);
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