using TaskTracker.Presentation.Navigation;

namespace TaskTracker.App.Desktop.Dialogs;

/// <summary>
/// A file picker that always answers with one fixed path and shows no dialog. It exists only so end-to-end
/// tests can export and import without driving a native dialog; <c>CompositionRoot</c> uses it only when both
/// <see cref="PathVariable"/> and <see cref="SmokeVariable"/>=1 are set, so a normal run never overwrites
/// or reads a file by accident.
/// </summary>
public sealed class TestFilePickerService(string path) : IFilePickerService
{
    /// <summary>Names the path every pick returns.</summary>
    public const string PathVariable = "TASKTRACKER_TEST_FILE_PATH";

    /// <summary>Must be 1 for <see cref="PathVariable"/> to have any effect.</summary>
    public const string SmokeVariable = "TASKTRACKER_SMOKE";

    public Task<string?> PickSavePathAsync(string title, string suggestedFileName, TransferFileKind kind)
    {
        return Task.FromResult<string?>(path);
    }

    public Task<string?> PickOpenPathAsync(string title, TransferFileKind kind)
    {
        return Task.FromResult<string?>(path);
    }
}