#pragma warning disable xUnit1051
using TaskTracker.Core.Search;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class SearchResultsExportTests
{
    [Fact]
    public async Task Export_is_unavailable_until_a_search_has_results()
    {
        await using var store = await CreateStoreWithItemsAsync("Alpha");
        var run = CreateRun(store);
        await run.Page.LoadAsync();

        Assert.False(run.Page.CanExportResults);
        Assert.False(run.Page.ExportResultsCommand.CanExecute(null));

        await run.Page.RunAsync();

        Assert.True(run.Page.CanExportResults);
        Assert.True(run.Page.ExportResultsCommand.CanExecute(null));
    }

    [Fact]
    public async Task Exporting_writes_every_match_in_order_not_only_the_shown_ones()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreWithItemsAsync("Alpha", "Beta", "Gamma");
        var run = CreateRun(store, resultLimit: 1);
        run.Files.SavePath = folder.File("results.csv");
        await run.Page.LoadAsync();
        await run.Page.RunAsync();

        await run.Page.ExportResultsCommand.ExecuteAsync(null);

        var lines = (await File.ReadAllTextAsync(folder.File("results.csv"))).Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        Assert.Single(run.Page.Results);
        Assert.Equal(4, lines.Length);
        Assert.Contains(folder.File("results.csv"), run.Page.ExportStatus);
        Assert.Contains("3 results", run.Page.ExportStatus);
        Assert.Equal(["search-results.csv"], run.Files.SuggestedNames);
    }

    [Fact]
    public async Task Exporting_uses_the_query_of_the_last_search_with_its_text()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreWithItemsAsync("Alpha", "Beta");
        var run = CreateRun(store);
        run.Files.SavePath = folder.File("results.csv");
        await run.Page.LoadAsync();
        run.Page.Text = "Beta";
        await run.Page.RunAsync();

        await run.Page.ExportResultsCommand.ExecuteAsync(null);

        var text = await File.ReadAllTextAsync(folder.File("results.csv"));
        Assert.Contains("Beta", text);
        Assert.DoesNotContain("Alpha", text);
    }

    [Fact]
    public async Task Cancelling_the_save_dialog_writes_nothing()
    {
        await using var store = await CreateStoreWithItemsAsync("Alpha");
        var run = CreateRun(store);
        await run.Page.LoadAsync();
        await run.Page.RunAsync();

        await run.Page.ExportResultsCommand.ExecuteAsync(null);

        Assert.Null(run.Page.ExportStatus);
        Assert.Single(run.Files.SaveKinds);
    }

    [Fact]
    public async Task A_file_that_cannot_be_written_is_reported_in_a_message()
    {
        using var folder = new TempDirectory();
        await using var store = await CreateStoreWithItemsAsync("Alpha");
        var run = CreateRun(store);
        run.Files.SavePath = folder.File(Path.Combine("missing", "results.csv"));
        await run.Page.LoadAsync();
        await run.Page.RunAsync();

        await run.Page.ExportResultsCommand.ExecuteAsync(null);

        Assert.Single(run.Dialogs.Messages);
        Assert.Null(run.Page.ExportStatus);
    }

    [Fact]
    public async Task A_page_without_import_export_support_has_no_export()
    {
        await using var store = await CreateStoreWithItemsAsync("Alpha");
        var page = SearchTestShell.CreatePage(store, new ItemSearchService(store.UnitOfWorkFactory,
            new ItemQueryValidator(store.UnitOfWorkFactory)));
        await page.LoadAsync();
        await page.RunAsync();

        Assert.False(page.HasExportSupport);
        Assert.False(page.CanExportResults);
    }

    private static async Task<PresentationTestStore> CreateStoreWithItemsAsync(params string[] titles)
    {
        var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");

        foreach (var title in titles)
        {
            await store.Items.CreateAsync(project.Id, null, null, title);
        }

        return store;
    }

    private static ExportRun CreateRun(PresentationTestStore store, int resultLimit = SearchViewModel.DefaultResultLimit)
    {
        var run = new ExportRun();
        var search = new ItemSearchService(store.UnitOfWorkFactory, new ItemQueryValidator(store.UnitOfWorkFactory));
        run.Page = new SearchViewModel(search, new FieldRegistry(store.UnitOfWorkFactory), store.Projects,
            new FakeNavigationService(), null, null, store.Lookups, resultLimit, parser: store.Parser,
            dialogs: run.Dialogs, transfer: new TransferServices(store.Transfer, run.Files));

        return run;
    }

    private sealed class ExportRun
    {
        public FakeDialogService Dialogs { get; } = new();

        public FakeFilePickerService Files { get; } = new();

        public SearchViewModel Page { get; set; } = null!;
    }
}