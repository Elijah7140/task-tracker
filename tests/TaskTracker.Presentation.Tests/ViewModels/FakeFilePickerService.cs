using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>A file picker that returns the paths a test sets, or null (the user cancelled).</summary>
internal sealed class FakeFilePickerService : IFilePickerService
{
    public string? SavePath { get; set; }

    public string? OpenPath { get; set; }

    /// <summary>When set, the save dialog stays open until the test completes it.</summary>
    public TaskCompletionSource<string?>? SaveGate { get; set; }

    public List<string> SuggestedNames { get; } = [];

    public List<TransferFileKind> SaveKinds { get; } = [];

    public int OpenCount { get; private set; }

    public Task<string?> PickSavePathAsync(string title, string suggestedFileName, TransferFileKind kind)
    {
        SuggestedNames.Add(suggestedFileName);
        SaveKinds.Add(kind);

        return SaveGate?.Task ?? Task.FromResult(SavePath);
    }

    public Task<string?> PickOpenPathAsync(string title, TransferFileKind kind)
    {
        OpenCount++;

        return Task.FromResult(OpenPath);
    }
}