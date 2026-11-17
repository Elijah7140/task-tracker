#pragma warning disable xUnit1051
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class MainWindowViewModelSavedSearchTests
{
    [Fact]
    public async Task Home_lists_the_saved_searches()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await SaveAsync(store, "Overdue", "due<today");
        await SaveAsync(store, "Errors", "type:error");
        var shell = SearchTestShell.Create(store);

        await shell.GoHomeAsync();

        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);
        Assert.Equal(["Overdue", "Errors"], home.SavedSearches!.Items.Select(entry => entry.Name));
        Assert.True(home.SavedSearches.HasItems);
    }

    [Fact]
    public async Task Opening_from_home_shows_search_with_the_saved_query_applied_and_Back_returns_home()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var saved = await SaveAsync(store, "Errors", "type:error deadlock");
        var shell = SearchTestShell.Create(store);
        await shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);

        await shell.OpenSavedSearchAsync(saved.Id);

        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        Assert.Equal("deadlock", page.Text);
        Assert.Equal("type", Assert.Single(page.Filters).SelectedField?.Key);
        Assert.Equal(saved.Id, page.SavedSearches!.Selected?.Id);
        await shell.ReturnFromSearchAsync();
        Assert.Same(home, shell.CurrentPage);
    }

    [Fact]
    public async Task A_project_scoped_saved_search_opens_with_that_project_as_its_scope()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var saved = await SaveAsync(store, "Mine", "type:error", new SearchScope.Project(project.Id));
        var shell = SearchTestShell.Create(store);
        await shell.GoHomeAsync();

        await shell.OpenSavedSearchAsync(saved.Id);

        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        Assert.Equal(SearchScopeKind.Project, page.SelectedScope.Kind);
        Assert.Equal([SearchScopeKind.AllProjects, SearchScopeKind.Project, SearchScopeKind.Root],
            page.ScopeOptions.Select(option => option.Kind));
    }

    [Fact]
    public async Task Opening_a_saved_search_from_the_search_page_replaces_it_and_keeps_the_original_return_page()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var saved = await SaveAsync(store, "Errors", "type:error");
        var shell = SearchTestShell.Create(store);
        await shell.GoHomeAsync();
        var home = shell.CurrentPage;
        await shell.OpenSearchAsync();
        var first = Assert.IsType<SearchViewModel>(shell.CurrentPage);

        await shell.OpenSavedSearchAsync(saved.Id);

        var second = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        Assert.NotSame(first, second);
        await shell.ReturnFromSearchAsync();
        Assert.Same(home, shell.CurrentPage);
    }

    [Fact]
    public async Task Opening_a_saved_search_that_was_deleted_says_so_and_refreshes_the_list()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var saved = await SaveAsync(store, "Gone", "type:error");
        var dialogs = new FakeDialogService();
        var shell = SearchTestShell.Create(store, dialogs);
        await shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);
        await store.SavedSearches.DeleteAsync(saved.Id);

        await shell.OpenSavedSearchAsync(saved.Id);

        Assert.Same(home, shell.CurrentPage);
        Assert.Equal(["This saved search no longer exists."], dialogs.Messages);
        Assert.Empty(home.SavedSearches!.Items);
    }

    [Fact]
    public async Task Returning_home_shows_searches_saved_on_the_search_page()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var dialogs = new FakeDialogService { PromptResult = "Fresh" };
        var shell = SearchTestShell.Create(store, dialogs);
        await shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.QueryText = "type:error";

        page.SavedSearches!.SaveCommand.Execute(null);
        await WaitUntilAsync(() => page.SavedSearches.Items.Count == 1);
        await shell.ReturnFromSearchAsync();

        Assert.Same(home, shell.CurrentPage);
        Assert.Equal(["Fresh"], home.SavedSearches!.Items.Select(entry => entry.Name));
    }

    [Fact]
    public async Task Home_rename_and_delete_act_on_the_chosen_entry()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await SaveAsync(store, "One", "type:error");
        await SaveAsync(store, "Two", "type:error");
        var dialogs = new FakeDialogService { PromptResult = "Renamed", ConfirmResult = true };
        var home = new HomeViewModel(store.Projects, dialogs, new FakeNavigationService(), store.SavedSearches);
        await home.LoadAsync();
        var list = home.SavedSearches!;

        list.RenameCommand.Execute(list.Items[1]);
        await WaitUntilAsync(() => list.Items.Any(entry => entry.Name == "Renamed"));
        list.DeleteCommand.Execute(list.Items[0]);
        await WaitUntilAsync(() => list.Items.Count == 1);

        Assert.Equal(["Renamed"], list.Items.Select(entry => entry.Name));
    }

    private static async Task<SavedSearch> SaveAsync(
        PresentationTestStore store, string name, string text, SearchScope? scope = null)
    {
        var registry = new FieldRegistry(store.UnitOfWorkFactory);
        var fields = await registry.GetFieldsAsync(new SearchScope.AllProjects());
        var choices = new Dictionary<string, IReadOnlyList<SearchChoice>>();

        foreach (var field in fields.Where(candidate => candidate.DataType == Core.Fields.FieldDataType.Choice))
        {
            choices[field.Key] = await registry.GetChoicesAsync(field);
        }

        var stable = store.Parser.Parse(text, fields, choices).StableText;
        var definition = new SavedSearchDefinition(stable, scope ?? new SearchScope.AllProjects(), false);
        return await store.SavedSearches.SaveAsync(name, definition);
    }

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        for (var attempt = 0; attempt < 300 && !condition(); attempt++)
        {
            await Task.Delay(10);
        }

        Assert.True(condition(), "The condition was not met in time.");
    }
}