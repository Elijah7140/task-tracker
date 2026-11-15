using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Search;
using TaskTracker.Core.Transfer;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Exporting the search results as CSV (§7.9).</summary>
public sealed partial class SearchViewModel
{
    /// <summary>The most matches an export writes; the page itself shows only the first <see cref="DefaultResultLimit"/>.</summary>
    public const int ExportResultLimit = 1_000_000;

    private readonly TransferServices? exportServices;
    private readonly IDialogService? exportDialogs;
    private ItemQuery? lastQuery;
    private string? exportStatus;

    /// <summary>Writes every match of the last search (not just the ones shown) to a CSV file.</summary>
    public AsyncRelayCommand ExportResultsCommand { get; }

    /// <summary>True when export is available and the last search found something.</summary>
    public bool CanExportResults => exportServices is not null && Results.Count > 0;

    /// <summary>True when the page was given what it needs to export.</summary>
    public bool HasExportSupport => exportServices is not null;

    /// <summary>The outcome of the last export, or null before any.</summary>
    public string? ExportStatus
    {
        get => exportStatus;
        private set => SetProperty(ref exportStatus, value);
    }

    private void OnResultsChanged(object? sender, System.Collections.Specialized.NotifyCollectionChangedEventArgs args)
    {
        OnPropertyChanged(nameof(CanExportResults));
        ExportResultsCommand.NotifyCanExecuteChanged();
    }

    private async Task ExportResultsAsync()
    {
        if (exportServices is null || lastQuery is null)
        {
            return;
        }

        var path = await exportServices.Files.PickSavePathAsync(
            "Export search results", TransferFiles.SuggestedName("search-results", TransferFileKind.Csv),
            TransferFileKind.Csv);

        if (path is not null)
        {
            await WriteResultsAsync(exportServices.Service, path, lastQuery);
        }
    }

    private async Task WriteResultsAsync(DataTransferService transfer, string path, ItemQuery query)
    {
        try
        {
            var all = await Task.Run(() => search.SearchAsync(query, ExportResultLimit));
            var text = await Task.Run(() => transfer.ExportResultsCsvAsync(all.Items));
            await TransferFiles.WriteAsync(path, text, TransferFileKind.Csv);
            ExportStatus = $"Exported {all.Items.Count} results to {path}.";
        }
        catch (Exception exception) when (exception is DomainRuleException or IOException or UnauthorizedAccessException)
        {
            ExportStatus = null;

            if (exportDialogs is not null)
            {
                await exportDialogs.ShowMessageAsync("Export search results", exception.Message);
            }
        }
    }
}