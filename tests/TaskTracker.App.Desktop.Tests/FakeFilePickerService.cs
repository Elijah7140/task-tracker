using TaskTracker.Presentation.Navigation;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>A file picker that answers with the paths a test sets instead of opening a native dialog.</summary>
public sealed class FakeFilePickerService : IFilePickerService
{
    public string? SavePath { get; set; }

    public string? OpenPath { get; set; }

    /// <summary>When set, the save dialog stays open until the test completes it.</summary>
    public TaskCompletionSource<string?>? SaveGate { get; set; }

    public List<string> SaveTitles { get; } = [];

    public int OpenCount { get; private set; }

    public Task<string?> PickSavePathAsync(string title, string suggestedFileName, TransferFileKind kind)
    {
        SaveTitles.Add(title);

        return SaveGate?.Task ?? Task.FromResult(SavePath);
    }

    public Task<string?> PickOpenPathAsync(string title, TransferFileKind kind)
    {
        OpenCount++;

        return Task.FromResult(OpenPath);
    }
}