#pragma warning disable xUnit1051
using TaskTracker.Core.Transfer;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class DataTransferViewModelTests
{
    [Fact]
    public async Task Exporting_everything_writes_a_json_file_without_a_byte_order_mark_and_reports_it()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync("Billing");
        var run = new Run(store) { Files = { SavePath = folder.File("all.json") } };

        await run.Page.ExportAllAsync();

        var bytes = await File.ReadAllBytesAsync(folder.File("all.json"));
        Assert.Equal((byte)'{', bytes[0]);
        Assert.Contains("Billing", System.Text.Encoding.UTF8.GetString(bytes));
        Assert.Contains(folder.File("all.json"), run.Page.StatusMessage);
        Assert.Equal(["task-tracker-export.json"], run.Files.SuggestedNames);
    }

    [Fact]
    public async Task Cancelling_the_save_dialog_writes_nothing_and_says_nothing()
    {
        await using var store = await CreateStoreAsync("Billing");
        var run = new Run(store);

        await run.Page.ExportAllAsync();

        Assert.Null(run.Page.StatusMessage);
        Assert.Empty(run.Dialogs.Messages);
    }

    [Fact]
    public async Task Exporting_a_project_as_json_uses_the_chosen_project()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync("Billing", "Home Lab");
        var run = new Run(store) { Dialogs = { ChooseResult = 1 }, Files = { SavePath = folder.File("one.json") } };

        await run.Page.ExportProjectAsync(TransferFileKind.Json);

        var text = await File.ReadAllTextAsync(folder.File("one.json"));
        Assert.Contains("Home Lab", text);
        Assert.DoesNotContain("Billing", text);
        Assert.Equal(["Home Lab.json"], run.Files.SuggestedNames);
        Assert.Equal(["Billing", "Home Lab"], run.Dialogs.ChooseOptions.Single());
    }

    [Fact]
    public async Task Exporting_a_project_as_csv_writes_a_byte_order_mark_for_excel()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync("Billing");
        await store.Items.CreateAsync((await store.Projects.ListAsync())[0].Project.Id, null, null, "Pay, \"urgently\"");
        var run = new Run(store) { Dialogs = { ChooseResult = 0 }, Files = { SavePath = folder.File("items.csv") } };

        await run.Page.ExportProjectAsync(TransferFileKind.Csv);

        var bytes = await File.ReadAllBytesAsync(folder.File("items.csv"));
        Assert.Equal([0xEF, 0xBB, 0xBF], bytes.Take(3));
        Assert.Contains("\"Pay, \"\"urgently\"\"\"", System.Text.Encoding.UTF8.GetString(bytes));
        Assert.Equal([TransferFileKind.Csv], run.Files.SaveKinds);
    }

    [Fact]
    public async Task Cancelling_the_project_choice_never_opens_the_save_dialog()
    {
        await using var store = await CreateStoreAsync("Billing");
        var run = new Run(store);

        await run.Page.ExportProjectAsync(TransferFileKind.Json);

        Assert.Empty(run.Files.SaveKinds);
    }

    [Fact]
    public async Task Exporting_a_project_with_no_projects_says_so()
    {
        await using var store = await CreateStoreAsync();
        var run = new Run(store);

        await run.Page.ExportProjectAsync(TransferFileKind.Json);

        Assert.Contains("no projects", Assert.Single(run.Dialogs.Messages));
        Assert.Empty(run.Dialogs.ChooseOptions);
    }

    [Fact]
    public async Task A_file_that_cannot_be_written_is_reported_instead_of_crashing()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync("Billing");
        var run = new Run(store) { Files = { SavePath = folder.File(Path.Combine("missing", "all.json")) } };

        await run.Page.ExportAllAsync();

        Assert.Single(run.Dialogs.Messages);
        Assert.Null(run.Page.StatusMessage);
    }

    [Fact]
    public async Task Importing_json_after_confirmation_adds_new_data_backs_up_and_reloads()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync("Billing");
        await File.WriteAllTextAsync(folder.File("in.json"), await store.Transfer.ExportJsonAsync(new TransferScope.AllData()));
        var run = new Run(store) { Dialogs = { ConfirmResult = true }, Files = { OpenPath = folder.File("in.json") } };

        await run.Page.ImportJsonAsync();

        var names = (await store.Projects.ListAsync()).Select(summary => summary.Project.Name);
        Assert.Equal(["Billing", "Billing (imported)"], names);
        Assert.Equal(1, run.Reloads);
        Assert.Equal(1, store.Backup.Count);
        Assert.Contains("Imported 1 project", run.Page.StatusMessage);
        Assert.Contains("backup-1.db.bak", run.Page.StatusMessage);
        Assert.Contains("can't be undone", Assert.Single(run.Dialogs.ConfirmMessages));
    }

    [Fact]
    public async Task Cancelling_the_open_dialog_or_the_confirmation_imports_nothing()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync("Billing");
        await File.WriteAllTextAsync(folder.File("in.json"), await store.Transfer.ExportJsonAsync(new TransferScope.AllData()));
        var cancelAtPicker = new Run(store);
        var cancelAtConfirm = new Run(store) { Files = { OpenPath = folder.File("in.json") } };

        await cancelAtPicker.Page.ImportJsonAsync();
        await cancelAtConfirm.Page.ImportJsonAsync();

        Assert.Single(await store.Projects.ListAsync());
        Assert.Empty(cancelAtPicker.Dialogs.ConfirmMessages);
        Assert.Single(cancelAtConfirm.Dialogs.ConfirmMessages);
        Assert.Equal(0, store.Backup.Count);
        Assert.Equal(0, cancelAtConfirm.Reloads);
        Assert.Null(cancelAtConfirm.Page.StatusMessage);
    }

    [Fact]
    public async Task An_invalid_json_file_lists_its_problems_and_asks_nothing()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync("Billing");
        await File.WriteAllTextAsync(folder.File("bad.json"), "{\"format\":\"task-tracker\",\"version\":9}");
        var run = new Run(store) { Dialogs = { ConfirmResult = true }, Files = { OpenPath = folder.File("bad.json") } };

        await run.Page.ImportJsonAsync();

        Assert.Contains("$.version", Assert.Single(run.Dialogs.Messages));
        Assert.Empty(run.Dialogs.ConfirmMessages);
        Assert.Single(await store.Projects.ListAsync());
    }

    [Fact]
    public async Task Importing_csv_shows_a_preview_and_adds_the_rows_when_confirmed()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync("Billing");
        await File.WriteAllTextAsync(folder.File("in.csv"), "Title,Type\r\nOne,Change\r\nTwo,\r\n");
        var run = new Run(store)
        {
            Dialogs = { ChooseResult = 0, PreviewResult = true },
            Files = { OpenPath = folder.File("in.csv") }
        };

        await run.Page.ImportCsvAsync();

        var preview = Assert.Single(run.Dialogs.Previews);
        Assert.True(preview.CanImport);
        Assert.Equal("2 rows", preview.RowSummary);
        Assert.Empty(run.Dialogs.FolderOptions);
        var projectId = (await store.Projects.ListAsync())[0].Project.Id;
        var area = await store.Items.LoadAreaAsync(projectId, null);
        Assert.Equal(["One", "Two"], area.Items.Select(node => node.Item.Title).Order());
        Assert.Equal(1, run.Reloads);
        Assert.Contains("Imported 2 items", run.Page.StatusMessage);
    }

    [Fact]
    public async Task A_preview_with_problems_shows_row_numbers_and_imports_nothing_even_if_confirmed()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync("Billing");
        await File.WriteAllTextAsync(folder.File("bad.csv"), "Title,Type\r\nFine,Change\r\nBroken,Nope\r\n");
        var run = new Run(store)
        {
            Dialogs = { ChooseResult = 0, PreviewResult = true },
            Files = { OpenPath = folder.File("bad.csv") }
        };

        await run.Page.ImportCsvAsync();

        var preview = Assert.Single(run.Dialogs.Previews);
        Assert.False(preview.CanImport);
        Assert.Contains(preview.IssueLines, line => line.StartsWith("Row 3, Type:"));
        var projectId = (await store.Projects.ListAsync())[0].Project.Id;
        Assert.Empty((await store.Items.LoadAreaAsync(projectId, null)).Items);
        Assert.Equal(0, store.Backup.Count);
        Assert.Equal(0, run.Reloads);
    }

    [Fact]
    public async Task Declining_the_csv_preview_imports_nothing()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync("Billing");
        await File.WriteAllTextAsync(folder.File("in.csv"), "Title\r\nOne\r\n");
        var run = new Run(store) { Dialogs = { ChooseResult = 0 }, Files = { OpenPath = folder.File("in.csv") } };

        await run.Page.ImportCsvAsync();

        var projectId = (await store.Projects.ListAsync())[0].Project.Id;
        Assert.Empty((await store.Items.LoadAreaAsync(projectId, null)).Items);
        Assert.Null(run.Page.StatusMessage);
    }

    [Fact]
    public async Task Importing_csv_asks_for_a_folder_when_the_project_has_folders()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync("Billing");
        var projectId = (await store.Projects.ListAsync())[0].Project.Id;
        var tables = await store.Folders.CreateAsync(projectId, null, "Tables");
        await File.WriteAllTextAsync(folder.File("in.csv"), "Title\r\nIn folder\r\n");
        var run = new Run(store)
        {
            Dialogs = { ChooseResult = 0, PreviewResult = true, FolderResult = new FolderChoice(tables.Id, "Tables", 1) },
            Files = { OpenPath = folder.File("in.csv") }
        };

        await run.Page.ImportCsvAsync();

        Assert.Equal(["Project root", "Tables"], run.Dialogs.FolderOptions.Single().Select(choice => choice.Name));
        var area = await store.Items.LoadAreaAsync(projectId, tables.Id);
        Assert.Equal("In folder", Assert.Single(area.Items).Item.Title);
    }

    [Fact]
    public async Task Cancelling_the_project_or_folder_choice_never_opens_the_file_dialog()
    {
        await using var store = await CreateStoreAsync("Billing");
        var projectId = (await store.Projects.ListAsync())[0].Project.Id;
        await store.Folders.CreateAsync(projectId, null, "Tables");
        var cancelProject = new Run(store);
        var cancelFolder = new Run(store) { Dialogs = { ChooseResult = 0 } };

        await cancelProject.Page.ImportCsvAsync();
        await cancelFolder.Page.ImportCsvAsync();

        Assert.Equal(0, cancelProject.Files.OpenCount);
        Assert.Equal(0, cancelFolder.Files.OpenCount);
    }

    private static async Task<PresentationTestStore> CreateStoreAsync(params string[] projectNames)
    {
        var store = new PresentationTestStore();
        await store.InitializeAsync();

        foreach (var name in projectNames)
        {
            await store.Projects.CreateAsync(name);
        }

        return store;
    }

    private sealed class Run
    {
        public Run(PresentationTestStore store)
        {
            Page = new DataTransferViewModel(store.Transfer, store.Projects, Dialogs, Files, CountReloadAsync);
        }

        public FakeDialogService Dialogs { get; } = new();

        public FakeFilePickerService Files { get; } = new();

        public DataTransferViewModel Page { get; }

        public int Reloads { get; private set; }

        private Task CountReloadAsync()
        {
            Reloads++;
            return Task.CompletedTask;
        }
    }
}