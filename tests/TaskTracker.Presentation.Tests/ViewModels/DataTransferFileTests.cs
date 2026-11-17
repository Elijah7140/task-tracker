#pragma warning disable xUnit1051
using System.Text;

using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class DataTransferFileTests
{
    [Fact]
    public async Task A_csv_file_that_is_not_utf8_is_refused_with_advice_and_imports_nothing()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync();
        var latin1 = Encoding.Latin1.GetBytes("Title\r\nCafé über\r\n");
        await File.WriteAllBytesAsync(folder.File("latin1.csv"), latin1);
        var run = new Run(store) { Dialogs = { ChooseResult = 0, PreviewResult = true }, Files = { OpenPath = folder.File("latin1.csv") } };

        await run.Page.ImportCsvAsync();

        Assert.Equal("This file isn't UTF-8. Re-save it as 'CSV UTF-8' and try again.", Assert.Single(run.Dialogs.Messages));
        Assert.Empty(run.Dialogs.Previews);
        Assert.Equal(0, store.Backup.Count);
    }

    [Fact]
    public async Task A_json_file_that_is_not_utf8_is_refused_with_advice()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync();
        await File.WriteAllBytesAsync(folder.File("utf16.json"), Encoding.Unicode.GetPreamble().Concat(Encoding.Unicode.GetBytes("{}")).ToArray());
        var run = new Run(store) { Dialogs = { ConfirmResult = true }, Files = { OpenPath = folder.File("utf16.json") } };

        await run.Page.ImportJsonAsync();

        Assert.Equal("This file isn't UTF-8. Re-save it as UTF-8 text and try again.", Assert.Single(run.Dialogs.Messages));
        Assert.Empty(run.Dialogs.ConfirmMessages);
    }

    [Fact]
    public async Task A_utf8_file_with_a_byte_order_mark_and_accented_text_is_imported()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync();
        var bytes = new UTF8Encoding(true).GetPreamble().Concat(new UTF8Encoding(false).GetBytes("Title\r\nCafé über\r\n")).ToArray();
        await File.WriteAllBytesAsync(folder.File("utf8.csv"), bytes);
        var run = new Run(store) { Dialogs = { ChooseResult = 0, PreviewResult = true }, Files = { OpenPath = folder.File("utf8.csv") } };

        await run.Page.ImportCsvAsync();

        var projectId = (await store.Projects.ListAsync())[0].Project.Id;
        var items = await store.Items.LoadAreaAsync(projectId, null);
        Assert.Equal("Café über", Assert.Single(items.Items).Item.Title);
    }

    [Fact]
    public async Task A_file_over_the_size_limit_is_refused_before_it_is_read()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync();
        await using (var stream = new FileStream(folder.File("huge.csv"), FileMode.Create))
        {
            stream.SetLength((50L * 1024 * 1024) + 1);
        }

        var run = new Run(store) { Dialogs = { ChooseResult = 0, PreviewResult = true }, Files = { OpenPath = folder.File("huge.csv") } };

        await run.Page.ImportCsvAsync();

        var message = Assert.Single(run.Dialogs.Messages);
        Assert.Contains("51 MB", message);
        Assert.Contains("50 MB", message);
        Assert.Empty(run.Dialogs.Previews);
    }

    [Fact]
    public async Task While_an_operation_runs_every_command_is_disabled_and_a_second_one_is_ignored()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreAsync();
        var gate = new TaskCompletionSource<string?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var run = new Run(store) { Files = { SaveGate = gate } };

        var first = run.Page.ExportAllAsync();
        var second = run.Page.ExportAllAsync();
        await second;

        Assert.True(run.Page.IsBusy);
        Assert.False(run.Page.IsIdle);
        Assert.False(run.Page.ExportAllCommand.CanExecute(null));
        Assert.False(run.Page.ImportJsonCommand.CanExecute(null));
        Assert.False(run.Page.ImportCsvCommand.CanExecute(null));
        Assert.Single(run.Files.SaveKinds);

        gate.SetResult(folder.File("done.json"));
        await first;

        Assert.False(run.Page.IsBusy);
        Assert.True(run.Page.ExportAllCommand.CanExecute(null));
        Assert.True(File.Exists(folder.File("done.json")));
    }

    [Fact]
    public async Task The_busy_state_ends_even_when_the_operation_fails()
    {
        await using var store = await CreateStoreAsync();
        var run = new Run(store) { Files = { SavePath = Path.Combine(Path.GetTempPath(), "missing-folder-xyz", "a.json") } };

        await run.Page.ExportAllAsync();

        Assert.False(run.Page.IsBusy);
        Assert.False(run.Page.IsWorking);
        Assert.Single(run.Dialogs.Messages);
    }

    private static async Task<PresentationTestStore> CreateStoreAsync()
    {
        var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Projects.CreateAsync("Billing");

        return store;
    }

    private sealed class Run
    {
        public Run(PresentationTestStore store)
        {
            Page = new DataTransferViewModel(store.Transfer, store.Projects, Dialogs, Files, () => Task.CompletedTask);
        }

        public FakeDialogService Dialogs { get; } = new();

        public FakeFilePickerService Files { get; } = new();

        public DataTransferViewModel Page { get; }
    }
}