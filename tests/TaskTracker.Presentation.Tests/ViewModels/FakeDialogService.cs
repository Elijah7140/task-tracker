using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

internal sealed class FakeDialogService : IDialogService
{
    public string? PromptResult { get; set; }

    public bool ConfirmResult { get; set; }

    public DraftDecision DraftResult { get; set; } = DraftDecision.Cancel;

    public FolderChoice? FolderResult { get; set; }

    /// <summary>The index <see cref="ChooseAsync"/> returns; null cancels.</summary>
    public int? ChooseResult { get; set; }

    /// <summary>Whether the user presses Import in the CSV preview.</summary>
    public bool PreviewResult { get; set; }

    public int DraftPromptCount { get; private set; }

    /// <summary>When set, the draft question stays open until the test completes it.</summary>
    public TaskCompletionSource<DraftDecision>? DraftGate { get; set; }

    public List<string> Messages { get; } = [];

    public List<string> ConfirmTitles { get; } = [];

    public List<string> ConfirmMessages { get; } = [];

    public List<bool> CancelDefaults { get; } = [];

    /// <summary>The options offered by each <see cref="ChooseAsync"/> call.</summary>
    public List<IReadOnlyList<string>> ChooseOptions { get; } = [];

    /// <summary>The previews shown by <see cref="ShowImportPreviewAsync"/>.</summary>
    public List<CsvImportPreviewViewModel> Previews { get; } = [];

    /// <summary>The folder lists offered by each <see cref="PickFolderAsync"/> call.</summary>
    public List<IReadOnlyList<FolderChoice>> FolderOptions { get; } = [];

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

    public Task<FolderChoice?> PickFolderAsync(string title, IReadOnlyList<FolderChoice> folders,
        string label = "Move into", string confirmText = "Move")
    {
        FolderOptions.Add(folders);

        return Task.FromResult(FolderResult);
    }

    public Task<int?> ChooseAsync(string title, string label, IReadOnlyList<string> options,
        string confirmText = "Choose")
    {
        ChooseOptions.Add(options);

        return Task.FromResult(ChooseResult);
    }

    public Task<bool> ShowImportPreviewAsync(CsvImportPreviewViewModel preview)
    {
        Previews.Add(preview);

        return Task.FromResult(PreviewResult);
    }

    public Task ShowMessageAsync(string title, string message)
    {
        Messages.Add(message);
        return Task.CompletedTask;
    }
}