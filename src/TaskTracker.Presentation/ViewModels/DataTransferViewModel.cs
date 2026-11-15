using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Transfer;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// The Import / Export menu of the Home page (§7.9): export everything or one project, import a JSON
/// export, or import a CSV file into a project. Cancelling any picker or confirmation stops quietly.
/// One operation runs at a time: while one is in progress every command is disabled, and the heavy work
/// (parsing, validating, exporting, importing) runs off the UI thread.
/// </summary>
public sealed class DataTransferViewModel : ViewModelBase
{
    private const int MaxIssueLines = 15;

    private readonly DataTransferService transfer;
    private readonly ProjectService projects;
    private readonly IDialogService dialogs;
    private readonly IFilePickerService files;
    private readonly Func<Task> reloadAsync;
    private string? statusMessage;
    private bool isBusy;
    private bool isWorking;

    public DataTransferViewModel(DataTransferService transfer, ProjectService projects, IDialogService dialogs,
        IFilePickerService files, Func<Task> reloadAsync)
    {
        this.transfer = transfer;
        this.projects = projects;
        this.dialogs = dialogs;
        this.files = files;
        this.reloadAsync = reloadAsync;
        ExportAllCommand = new AsyncRelayCommand(ExportAllAsync, () => IsIdle);
        ExportProjectJsonCommand = new AsyncRelayCommand(() => ExportProjectAsync(TransferFileKind.Json), () => IsIdle);
        ExportProjectCsvCommand = new AsyncRelayCommand(() => ExportProjectAsync(TransferFileKind.Csv), () => IsIdle);
        ImportJsonCommand = new AsyncRelayCommand(ImportJsonAsync, () => IsIdle);
        ImportCsvCommand = new AsyncRelayCommand(ImportCsvAsync, () => IsIdle);
    }

    public AsyncRelayCommand ExportAllCommand { get; }

    public AsyncRelayCommand ExportProjectJsonCommand { get; }

    public AsyncRelayCommand ExportProjectCsvCommand { get; }

    public AsyncRelayCommand ImportJsonCommand { get; }

    public AsyncRelayCommand ImportCsvCommand { get; }

    /// <summary>The outcome of the last export or import, or null before any.</summary>
    public string? StatusMessage
    {
        get => statusMessage;
        private set => SetProperty(ref statusMessage, value);
    }

    /// <summary>True while an export or import is in progress, including while it waits for a dialog.</summary>
    public bool IsBusy
    {
        get => isBusy;
        private set
        {
            if (SetProperty(ref isBusy, value))
            {
                OnPropertyChanged(nameof(IsIdle));
                NotifyCommandsChanged();
            }
        }
    }

    /// <summary>The opposite of <see cref="IsBusy"/>; the menu is enabled only while idle.</summary>
    public bool IsIdle => !isBusy;

    /// <summary>True while data is actually being read, checked or written (a progress bar shows then).</summary>
    public bool IsWorking
    {
        get => isWorking;
        private set => SetProperty(ref isWorking, value);
    }

    /// <summary>Exports the whole database as JSON to a file the user picks.</summary>
    public Task ExportAllAsync()
    {
        return RunExclusiveAsync(ExportEverythingAsync);
    }

    /// <summary>Exports one project, chosen from a list, as JSON (everything it holds) or CSV (its items).</summary>
    public Task ExportProjectAsync(TransferFileKind kind)
    {
        return RunExclusiveAsync(() => ExportChosenProjectAsync(kind));
    }

    /// <summary>
    /// Picks a JSON export, checks it, asks for confirmation (imports cannot be undone, but a backup is
    /// taken first), then adds its contents as new data and reloads the project list.
    /// </summary>
    public Task ImportJsonAsync()
    {
        return RunExclusiveAsync(PickAndImportJsonAsync);
    }

    /// <summary>
    /// Chooses a project (and folder) and a CSV file, shows a preview with every problem, and on
    /// confirmation adds the rows as new items. Nothing is imported while the preview has problems.
    /// </summary>
    public Task ImportCsvAsync()
    {
        return RunExclusiveAsync(PickAndImportCsvAsync);
    }

    private async Task ExportEverythingAsync()
    {
        var fileName = TransferFiles.SuggestedName("task-tracker-export", TransferFileKind.Json);
        var path = await files.PickSavePathAsync("Export everything", fileName, TransferFileKind.Json);

        if (path is null)
        {
            return;
        }

        var json = await WorkAsync(() => transfer.ExportJsonAsync(new TransferScope.AllData()));
        await TransferFiles.WriteAsync(path, json, TransferFileKind.Json);
        StatusMessage = $"Exported everything to {path}.";
    }

    private async Task ExportChosenProjectAsync(TransferFileKind kind)
    {
        var project = await ChooseProjectAsync("Export project", "Export");

        if (project is null)
        {
            return;
        }

        var fileName = TransferFiles.SuggestedName(project.Name, kind);
        var path = await files.PickSavePathAsync($"Export {project.Name}", fileName, kind);

        if (path is null)
        {
            return;
        }

        var text = await WorkAsync(() => ExportProjectTextAsync(project, kind));
        await TransferFiles.WriteAsync(path, text, kind);
        StatusMessage = $"Exported {project.Name} to {path}.";
    }

    private Task<string> ExportProjectTextAsync(Project project, TransferFileKind kind)
    {
        if (kind == TransferFileKind.Csv)
        {
            return transfer.ExportProjectCsvAsync(project.Id);
        }

        return transfer.ExportJsonAsync(new TransferScope.SingleProject(project.Id));
    }

    private async Task PickAndImportJsonAsync()
    {
        var path = await files.PickOpenPathAsync("Import JSON", TransferFileKind.Json);

        if (path is not null)
        {
            await ImportJsonFileAsync(path);
        }
    }

    private async Task ImportJsonFileAsync(string path)
    {
        var text = await WorkAsync(() => TransferFiles.ReadAsync(path, TransferFileKind.Json));
        var check = await WorkAsync(() => Task.FromResult(transfer.CheckJson(text)));

        if (!check.IsValid)
        {
            await ShowFailureAsync("This file can't be imported", check.Issues);
            return;
        }

        var question = $"Import {Describe(check.Summary)} from {Path.GetFileName(path)}?\n\n" +
            "Everything is added as new data; nothing you have is changed or overwritten. " +
            "An import can't be undone with Undo, so a backup of your database is saved first.";

        if (await dialogs.ConfirmAsync("Import data", question, "Import"))
        {
            await CompleteImportAsync(await WorkAsync(() => transfer.ImportJsonAsync(text)));
        }
    }

    private async Task PickAndImportCsvAsync()
    {
        var project = await ChooseProjectAsync("Import CSV into project", "Next");

        if (project is null)
        {
            return;
        }

        var folder = await ChooseFolderAsync(project);

        if (folder is not null)
        {
            await ImportCsvIntoAsync(project, folder.Id);
        }
    }

    private async Task ImportCsvIntoAsync(Project project, Guid? folderId)
    {
        var path = await files.PickOpenPathAsync("Import CSV", TransferFileKind.Csv);

        if (path is null)
        {
            return;
        }

        var text = await WorkAsync(() => TransferFiles.ReadAsync(path, TransferFileKind.Csv));
        var preview = await WorkAsync(() => transfer.PreviewCsvAsync(text, project.Id, folderId));
        var model = new CsvImportPreviewViewModel(preview, Path.GetFileName(path), project.Name);

        if (await dialogs.ShowImportPreviewAsync(model) && preview.CanImport)
        {
            await CompleteImportAsync(await WorkAsync(() => transfer.ImportCsvAsync(text, project.Id, folderId)));
        }
    }

    private async Task CompleteImportAsync(TransferResult result)
    {
        if (!result.Succeeded)
        {
            await ShowFailureAsync("The import was stopped; nothing was changed", result.Issues);
            return;
        }

        var backup = result.BackupPath is null ? string.Empty : $" A backup was saved to {result.BackupPath}.";
        StatusMessage = $"Imported {Describe(result.Summary)}.{backup}";
        await reloadAsync();
    }

    private async Task<Project?> ChooseProjectAsync(string title, string confirmText)
    {
        var summaries = await projects.ListAsync();

        if (summaries.Count == 0)
        {
            await dialogs.ShowMessageAsync(title, "There are no projects yet.");
            return null;
        }

        var names = summaries.Select(summary => summary.Project.Name).ToList();
        var index = await dialogs.ChooseAsync(title, "Project", names, confirmText);

        return index is int chosen ? summaries[chosen].Project : null;
    }

    /// <summary>Asks which folder to import into; a project without folders imports into its root without asking.</summary>
    private async Task<FolderChoice?> ChooseFolderAsync(Project project)
    {
        var workspace = await projects.LoadWorkspaceAsync(project.Id);
        var choices = new List<FolderChoice> { new(null, "Project root", 0) };
        AddFolderChoices(workspace.Folders, null, 1, choices);

        if (choices.Count == 1)
        {
            return choices[0];
        }

        return await dialogs.PickFolderAsync($"Import into {project.Name}", choices, "Import into", "Next");
    }

    private static void AddFolderChoices(FolderTree tree, Guid? parentId, int depth, List<FolderChoice> choices)
    {
        foreach (var folder in tree.Children(parentId))
        {
            choices.Add(new FolderChoice(folder.Id, folder.Name, depth));
            AddFolderChoices(tree, folder.Id, depth + 1, choices);
        }
    }

    private Task ShowFailureAsync(string title, IReadOnlyList<TransferIssue> issues)
    {
        var lines = TransferIssueText.Lines(issues, MaxIssueLines);

        return dialogs.ShowMessageAsync(title, string.Join("\n", lines));
    }

    private static string Describe(TransferSummary summary)
    {
        var parts = new List<string>();
        AddPart(parts, summary.Projects, "project", "projects");
        AddPart(parts, summary.Folders, "folder", "folders");
        AddPart(parts, summary.Items, "item", "items");
        AddPart(parts, summary.SavedSearches, "saved search", "saved searches");

        return parts.Count == 0 ? "no data" : string.Join(", ", parts);
    }

    private static void AddPart(List<string> parts, int count, string singular, string plural)
    {
        if (count > 0)
        {
            var noun = count == 1 ? singular : plural;
            parts.Add($"{count} {noun}");
        }
    }

    /// <summary>Runs a step on a worker thread, showing the progress bar for as long as it takes.</summary>
    private async Task<T> WorkAsync<T>(Func<Task<T>> step)
    {
        IsWorking = true;

        try
        {
            return await Task.Run(step);
        }
        finally
        {
            IsWorking = false;
        }
    }

    /// <summary>Runs one export or import at a time and reports problems the user can act on in a message box.</summary>
    private async Task RunExclusiveAsync(Func<Task> action)
    {
        if (isBusy)
        {
            return;
        }

        IsBusy = true;

        try
        {
            await action();
        }
        catch (Exception exception) when (exception is DomainRuleException or IOException or UnauthorizedAccessException)
        {
            await dialogs.ShowMessageAsync("Import and export", exception.Message);
        }
        finally
        {
            IsBusy = false;
        }
    }

    private void NotifyCommandsChanged()
    {
        ExportAllCommand.NotifyCanExecuteChanged();
        ExportProjectJsonCommand.NotifyCanExecuteChanged();
        ExportProjectCsvCommand.NotifyCanExecuteChanged();
        ImportJsonCommand.NotifyCanExecuteChanged();
        ImportCsvCommand.NotifyCanExecuteChanged();
    }
}