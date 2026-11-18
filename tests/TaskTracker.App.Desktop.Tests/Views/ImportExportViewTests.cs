using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Transfer;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Transfer commands and the search export button, driven by simulated clicks and keys.</summary>
public sealed class ImportExportViewTests
{
    [AvaloniaFact]
    public async Task Export_everything_from_the_menu_writes_the_file_and_shows_the_status()
    {
        using var folder = new TempFolder();
        var files = new FakeFilePickerService { SavePath = folder.File("all.json") };
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, files);
        await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = Show(window, services);
        await shell.GoHomeAsync();

        await ChooseMenuItemAsync(window, "ExportAllMenuItem");

        await WaitForStatusAsync(window, "TransferStatusText", "Exported everything");
        Assert.Contains("Billing", await File.ReadAllTextAsync(folder.File("all.json")));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Cancelling_the_save_dialog_from_the_menu_asks_once_and_leaves_no_status()
    {
        var files = new FakeFilePickerService();
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, files);
        var shell = Show(window, services);
        await shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);

        await ChooseMenuItemAsync(window, "ExportAllMenuItem");

        await HeadlessInput.WaitUntilAsync(() => files.SaveTitles.Count == 1 && !home.Transfer!.IsBusy);
        Assert.Null(home.Transfer!.StatusMessage);
        Assert.Single(files.SaveTitles);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Import_json_asks_for_confirmation_and_then_adds_the_projects_after_a_backup()
    {
        using var folder = new TempFolder();
        var files = new FakeFilePickerService { OpenPath = folder.File("in.json") };
        var backup = new CountingDatabaseBackup();
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, files, backup);
        await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var json = await services.GetRequiredService<DataTransferService>().ExportJsonAsync(new TransferScope.AllData());
        await File.WriteAllTextAsync(folder.File("in.json"), json);
        var shell = Show(window, services);
        await shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);

        await ChooseMenuItemAsync(window, "ImportJsonMenuItem");
        var dialog = await WaitForDialogAsync(window);
        Assert.Equal("Import data", dialog.Title);
        HeadlessInput.Press(dialog, Key.Enter);

        await HeadlessInput.WaitUntilAsync(() => home.Cards.Count == 2);
        Assert.Equal(["Billing", "Billing (imported)"], home.Cards.Select(card => card.Name));
        Assert.Contains("Imported 1 project", home.Transfer!.StatusMessage);
        Assert.Equal(1, backup.Count);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Escape_at_the_import_confirmation_imports_nothing_and_takes_no_backup()
    {
        using var folder = new TempFolder();
        var files = new FakeFilePickerService { OpenPath = folder.File("in.json") };
        var backup = new CountingDatabaseBackup();
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, files, backup);
        await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var json = await services.GetRequiredService<DataTransferService>().ExportJsonAsync(new TransferScope.AllData());
        await File.WriteAllTextAsync(folder.File("in.json"), json);
        var shell = Show(window, services);
        await shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);

        var import = home.Transfer!.ImportJsonAsync();
        var dialog = await WaitForDialogAsync(window);
        HeadlessInput.Press(dialog, Key.Escape);
        await import;

        Assert.Single(home.Cards);
        Assert.Null(home.Transfer.StatusMessage);
        Assert.Equal(0, backup.Count);
        Assert.Empty(window.OwnedWindows);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_file_that_cannot_be_imported_shows_its_problems_in_a_message_and_changes_nothing()
    {
        using var folder = new TempFolder();
        var files = new FakeFilePickerService { OpenPath = folder.File("bad.json") };
        var backup = new CountingDatabaseBackup();
        await File.WriteAllTextAsync(folder.File("bad.json"), "{\"format\":\"task-tracker\",\"version\":9}");
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, files, backup);
        var shell = Show(window, services);
        await shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);

        var import = home.Transfer!.ImportJsonAsync();
        var dialog = await WaitForDialogAsync(window);

        Assert.Equal("This file can't be imported", dialog.Title);
        var text = dialog.GetVisualDescendants().OfType<TextBlock>().Select(block => block.Text);
        Assert.Contains(text, line => line?.Contains("$.version") == true);
        HeadlessInput.Press(dialog, Key.Enter);
        await import;
        Assert.Empty(home.Cards);
        Assert.Equal(0, backup.Count);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Import_csv_shows_the_preview_and_the_import_button_adds_the_rows()
    {
        using var folder = new TempFolder();
        var files = new FakeFilePickerService { OpenPath = folder.File("in.csv") };
        await File.WriteAllTextAsync(folder.File("in.csv"), "Title,Type\r\nFirst,Change\r\nSecond,\r\n");
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, files);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = Show(window, services);
        await shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);

        var import = home.Transfer!.ImportCsvAsync();
        HeadlessInput.Press(await WaitForDialogAsync(window), Key.Enter);
        var preview = await WaitForDialogAsync(window, "Import CSV");
        Assert.Equal("2 rows", HeadlessInput.Find<TextBlock>(preview, "ImportPreviewRowCount").Text);
        HeadlessInput.Click(preview, HeadlessInput.Find<Button>(preview, "DialogConfirmButton"));
        await import;

        var area = await services.GetRequiredService<ItemService>().LoadAreaAsync(project.Id, null);
        Assert.Equal(["First", "Second"], area.Items.Select(node => node.Item.Title).Order());
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_csv_preview_with_errors_marks_the_row_has_no_import_button_and_imports_nothing()
    {
        using var folder = new TempFolder();
        var files = new FakeFilePickerService { OpenPath = folder.File("bad.csv") };
        await File.WriteAllTextAsync(folder.File("bad.csv"), "Title,Type\r\nFirst,Change\r\nSecond,Nope\r\n");
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, files);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = Show(window, services);
        await shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);

        var import = home.Transfer!.ImportCsvAsync();
        HeadlessInput.Press(await WaitForDialogAsync(window), Key.Enter);
        var preview = await WaitForDialogAsync(window, "Import CSV");

        var issues = HeadlessInput.Find<ItemsControl>(preview, "ImportPreviewIssues");
        Assert.Contains(issues.Items.OfType<string>(), line => line.StartsWith("Row 3, Type:"));
        Assert.Single(HeadlessInput.FindAll<TextBlock>(preview, "ImportPreviewRowError"));
        Assert.Equal("Close", HeadlessInput.Find<Button>(preview, "DialogConfirmButton").Content);
        HeadlessInput.Press(preview, Key.Escape);
        await import;
        var area = await services.GetRequiredService<ItemService>().LoadAreaAsync(project.Id, null);
        Assert.Empty(area.Items);
        window.Close();
    }

    [AvaloniaFact]
    public async Task While_an_export_waits_for_its_dialog_the_command_is_disabled_and_a_second_click_is_ignored()
    {
        using var folder = new TempFolder();
        var gate = new TaskCompletionSource<string?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var files = new FakeFilePickerService { SaveGate = gate };
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, files);
        var shell = Show(window, services);
        await shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);
        Dispatcher.UIThread.RunJobs();

        await ChooseMenuItemAsync(window, "ExportAllMenuItem");
        await HeadlessInput.WaitUntilAsync(() => files.SaveTitles.Count == 1);
        HeadlessInput.Click(window, HeadlessInput.Find<MenuItem>(window, "FileMenu"));
        var export = HeadlessInput.Find<MenuItem>(window, "ExportAllMenuItem");
        HeadlessInput.Click(window, export);

        Assert.False(export.IsEnabled);
        Assert.True(home.Transfer!.IsBusy);
        Assert.Single(files.SaveTitles);
        gate.SetResult(folder.File("late.json"));
        await HeadlessInput.WaitUntilAsync(() => File.Exists(folder.File("late.json")) && !home.Transfer.IsBusy);
        Assert.True(export.IsEnabled);
        Assert.Single(files.SaveTitles);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Export_results_from_the_search_page_writes_a_csv_of_the_matches()
    {
        using var folder = new TempFolder();
        var files = new FakeFilePickerService { SavePath = folder.File("results.csv") };
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, files);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        await services.GetRequiredService<ItemService>().CreateAsync(project.Id, null, null, "Pay invoice");
        var shell = Show(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SearchButton"));
        await HeadlessInput.WaitUntilAsync(() => page.Results.Count == 1);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "ExportResultsButton"));

        await WaitForStatusAsync(window, "ExportResultsStatusText", "Exported 1 results");
        Assert.Contains("Pay invoice", await File.ReadAllTextAsync(folder.File("results.csv")));
        window.Close();
    }

    [AvaloniaFact]
    public async Task The_search_export_status_takes_no_room_until_there_is_a_status()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, new FakeFilePickerService());
        var shell = Show(window, services);
        await shell.GoHomeAsync();

        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        Dispatcher.UIThread.RunJobs();

        Assert.Empty(HeadlessInput.FindAll<TextBlock>(window, "ExportResultsStatusText"));
        window.Close();
    }

    private static MainWindowViewModel Show(MainWindow window, IServiceProvider services)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        return shell;
    }

    /// <summary>Invokes an application-wide transfer command from File.</summary>
    private static async Task ChooseMenuItemAsync(MainWindow window, string menuItemId)
    {
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Click(window, HeadlessInput.Find<MenuItem>(window, "FileMenu"));
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.FindAll<MenuItem>(window, menuItemId).Count == 1);
        HeadlessInput.Click(window, HeadlessInput.Find<MenuItem>(window, menuItemId));
    }

    /// <summary>
    /// Waits for the status line, which the app sets only after the file is written and closed. Waiting for the
    /// file to exist is not enough: it exists while it is still being written.
    /// </summary>
    private static async Task WaitForStatusAsync(Window window, string statusId, string expected)
    {
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.FindAll<TextBlock>(window, statusId)
            .Any(status => status.Text?.Contains(expected) == true));
    }

    private static async Task<Window> WaitForDialogAsync(Window owner, string? title = null)
    {
        await HeadlessInput.WaitUntilAsync(() => owner.OwnedWindows.Any(dialog => title is null || dialog.Title == title));

        return owner.OwnedWindows.First(dialog => title is null || dialog.Title == title);
    }

    private sealed class TempFolder : IDisposable
    {
        public TempFolder()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"tasktracker-ui-files-{Guid.CreateVersion7()}");
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public string File(string name)
        {
            return System.IO.Path.Combine(Path, name);
        }

        public void Dispose()
        {
            Directory.Delete(Path, recursive: true);
        }
    }
}