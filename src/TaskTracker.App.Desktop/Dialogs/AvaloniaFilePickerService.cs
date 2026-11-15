using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Platform.Storage;

using TaskTracker.Presentation.Navigation;

namespace TaskTracker.App.Desktop.Dialogs;

/// <summary>Opens the operating system's save and open file dialogs through Avalonia's storage provider.</summary>
public sealed class AvaloniaFilePickerService : IFilePickerService
{
    private readonly Window? owner;

    public AvaloniaFilePickerService(Window? owner = null)
    {
        this.owner = owner;
    }

    public async Task<string?> PickSavePathAsync(string title, string suggestedFileName, TransferFileKind kind)
    {
        var options = new FilePickerSaveOptions
        {
            Title = title,
            SuggestedFileName = suggestedFileName,
            DefaultExtension = kind == TransferFileKind.Csv ? "csv" : "json",
            FileTypeChoices = [FileType(kind)],
            ShowOverwritePrompt = true
        };
        var file = await GetOwner().StorageProvider.SaveFilePickerAsync(options);

        return file?.TryGetLocalPath();
    }

    public async Task<string?> PickOpenPathAsync(string title, TransferFileKind kind)
    {
        var options = new FilePickerOpenOptions
        {
            Title = title,
            AllowMultiple = false,
            FileTypeFilter = [FileType(kind)]
        };
        var files = await GetOwner().StorageProvider.OpenFilePickerAsync(options);

        return files.Count == 0 ? null : files[0].TryGetLocalPath();
    }

    private static FilePickerFileType FileType(TransferFileKind kind)
    {
        if (kind == TransferFileKind.Csv)
        {
            return new FilePickerFileType("CSV files") { Patterns = ["*.csv"] };
        }

        return new FilePickerFileType("JSON files") { Patterns = ["*.json"] };
    }

    private Window GetOwner()
    {
        var lifetime = Application.Current?.ApplicationLifetime as IClassicDesktopStyleApplicationLifetime;

        return owner ?? lifetime?.MainWindow ?? throw new InvalidOperationException("Main window is unavailable.");
    }
}