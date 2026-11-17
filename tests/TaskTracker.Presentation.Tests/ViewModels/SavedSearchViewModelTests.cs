#pragma warning disable xUnit1051
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class SavedSearchViewModelTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Saving_asks_for_a_name_and_stores_the_query_with_choice_ids()
    {
        await using var world = await World.CreateAsync();
        world.Page.QueryText = "priority:high due<today";
        world.Dialogs.PromptResult = "Overdue";

        world.Page.SavedSearches!.SaveCommand.Execute(null);
        await world.WaitForListAsync(1);

        var saved = Assert.Single(await world.Service.ListAsync());
        var high = (await world.Store.Lookups.PriorityLevelsAsync()).Single(level => level.Name == "High");
        Assert.Equal($"priority:#{high.Id:D} due<today", saved.QueryText);
        Assert.Equal("Overdue", world.Page.SavedSearches.Selected?.Name);
        Assert.True(world.Page.SavedSearches.Items[0].IsSelected);
    }

    [Fact]
    public async Task Saving_stores_the_scope_and_the_completed_switch()
    {
        await using var world = await World.CreateAsync(withProject: true);
        world.Page.IncludeCompleted = true;
        world.Dialogs.PromptResult = "Mine";

        world.Page.SavedSearches!.SaveCommand.Execute(null);
        await world.WaitForListAsync(1);

        var saved = Assert.Single(await world.Service.ListAsync());
        Assert.Equal(new SearchScope.Project(world.ProjectId!.Value), saved.ToScope());
        Assert.True(saved.IncludeCompleted);
    }

    [Fact]
    public async Task Opening_a_root_only_search_preserves_its_area_scope()
    {
        await using var world = await World.CreateAsync(withProject: true);
        var scope = new SearchScope.Area(world.ProjectId!.Value, null, false);
        var saved = await SaveAsync(world, "At root", "", scope);

        await world.Page.OpenSavedAsync(saved);

        Assert.Equal(SearchScopeKind.Root, world.Page.SelectedScope.Kind);
        Assert.False(world.Page.IncludeSubfolders);
        world.Dialogs.PromptResult = "Root copy";
        world.Page.SavedSearches!.SaveCommand.Execute(null);
        await world.WaitForListAsync(2);
        Assert.Equal(scope, (await world.Service.ListAsync()).Single(item => item.Name == "Root copy").ToScope());
    }

    [Fact]
    public async Task Cancelling_the_name_prompt_saves_nothing()
    {
        await using var world = await World.CreateAsync();
        world.Dialogs.PromptResult = null;

        world.Page.SavedSearches!.SaveCommand.Execute(null);
        await Task.Delay(100);

        Assert.Empty(await world.Service.ListAsync());
    }

    [Fact]
    public async Task Saving_invalid_text_shows_the_parse_error_and_saves_nothing()
    {
        await using var world = await World.CreateAsync();
        world.Page.QueryText = "zzz:1";
        world.Dialogs.PromptResult = "Bad";

        world.Page.SavedSearches!.SaveCommand.Execute(null);
        await Task.Delay(100);

        Assert.Contains("Unknown field 'zzz'", world.Page.Error);
        Assert.Empty(await world.Service.ListAsync());
    }

    [Theory]
    [InlineData(true, "Error")]
    [InlineData(false, "Discussion")]
    public async Task Saving_over_an_existing_name_asks_before_replacing_it(bool confirm, string expectedType)
    {
        await using var world = await World.CreateAsync();
        await SaveAsync(world, "Mine", "type:discussion");
        await world.Page.SavedSearches!.LoadAsync();
        world.Page.QueryText = "type:error";
        world.Dialogs.PromptResult = "mine";
        world.Dialogs.ConfirmResult = confirm;

        world.Page.SavedSearches.SaveCommand.Execute(null);
        await world.WaitForConfirmAsync();

        var saved = Assert.Single(await world.Service.ListAsync());
        Assert.Equal("Replace saved search", Assert.Single(world.Dialogs.ConfirmTitles));
        Assert.Equal(expectedType, await world.StoredLabelsAsync(saved));
    }

    [Fact]
    public async Task Rename_uses_the_selected_search_and_reloads_the_list()
    {
        await using var world = await World.CreateAsync();
        var saved = await SaveAsync(world, "Old", "type:error");
        await world.Page.OpenSavedAsync(saved);
        world.Dialogs.PromptResult = "New";

        world.Page.SavedSearches!.RenameCommand.Execute(null);
        await world.WaitUntilAsync(() => world.Page.SavedSearches.Items.Any(entry => entry.Name == "New"));

        Assert.Equal("New", world.Page.SavedSearches.Selected?.Name);
        Assert.Equal("New", Assert.Single(await world.Service.ListAsync()).Name);
    }

    [Fact]
    public async Task Renaming_to_another_searchs_name_shows_the_rule_error_inline()
    {
        await using var world = await World.CreateAsync();
        await SaveAsync(world, "First", "type:error");
        var second = await SaveAsync(world, "Second", "type:error");
        await world.Page.OpenSavedAsync(second);
        world.Dialogs.PromptResult = "FIRST";

        world.Page.SavedSearches!.RenameCommand.Execute(null);
        await world.WaitUntilAsync(() => world.Page.SavedSearches.Error is not null);

        Assert.Equal("A saved search named 'First' already exists.", world.Page.SavedSearches.Error);
    }

    [Fact]
    public async Task Delete_needs_confirmation_and_removes_the_selected_search()
    {
        await using var world = await World.CreateAsync();
        var saved = await SaveAsync(world, "Gone", "type:error");
        await world.Page.OpenSavedAsync(saved);
        world.Dialogs.ConfirmResult = false;
        world.Page.SavedSearches!.DeleteCommand.Execute(null);
        await Task.Delay(100);
        Assert.Single(await world.Service.ListAsync());

        world.Dialogs.ConfirmResult = true;
        world.Page.SavedSearches.DeleteCommand.Execute(null);
        await world.WaitForListAsync(0);

        Assert.Empty(await world.Service.ListAsync());
        Assert.Null(world.Page.SavedSearches.Selected);
    }

    [Fact]
    public async Task Opening_from_the_list_asks_the_shell_to_open_that_saved_search()
    {
        await using var world = await World.CreateAsync();
        var saved = await SaveAsync(world, "Mine", "type:error");
        await world.Page.SavedSearches!.LoadAsync();

        world.Page.SavedSearches.OpenCommand.Execute(world.Page.SavedSearches.Items[0]);

        Assert.Equal([saved.Id], world.Navigation.OpenedSavedSearchIds);
    }

    [Fact]
    public async Task Opening_a_saved_search_restores_scope_text_filters_and_runs_it()
    {
        await using var world = await World.CreateAsync(withProject: true);
        await world.CreateItemAsync("Fix deadlock", "Error", "High");
        await world.CreateItemAsync("Discuss it", "Discussion", "High");
        var saved = await SaveAsync(world, "Errors", "deadlock type:error",
            scope: new SearchScope.Project(world.ProjectId!.Value), includeCompleted: true);

        await world.Page.OpenSavedAsync(saved);

        Assert.Equal(SearchScopeKind.Project, world.Page.SelectedScope.Kind);
        Assert.Equal("deadlock", world.Page.Text);
        Assert.Equal("deadlock type:Error", world.Page.QueryText);
        Assert.Equal(["type"], world.Page.Filters.Select(row => row.SelectedField?.Key));
        Assert.True(world.Page.IncludeCompleted);
        Assert.Null(world.Page.Error);
        Assert.Equal(["Fix deadlock"], world.Page.Results.Select(row => row.Title));
        Assert.Same(world.Page.SavedSearches!.Selected, world.Page.SavedSearches.Items[0]);
    }

    [Fact]
    public async Task A_saved_search_survives_renaming_a_choice_label()
    {
        await using var world = await World.CreateAsync();
        await world.CreateItemAsync("Fix deadlock", "Error", "High");
        var saved = await SaveAsync(world, "Highs", "priority:high");
        var high = (await world.Store.Lookups.PriorityLevelsAsync()).Single(level => level.Name == "High");
        await world.Store.Lookups.RenamePriorityLevelAsync(high.Id, "Urgent");

        await world.Page.OpenSavedAsync(saved);

        Assert.Null(world.Page.Error);
        Assert.Equal("Urgent", world.Page.Filters.Single().SelectedChoice?.Label);
        Assert.Equal(["Fix deadlock"], world.Page.Results.Select(row => row.Title));
    }

    [Fact]
    public async Task A_saved_search_using_an_archived_field_reports_it_and_runs_nothing()
    {
        await using var world = await World.CreateAsync();
        var field = await world.Store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var saved = await SaveAsync(world, "Heavy", "effort>3");
        await world.Store.Fields.ArchiveAsync(field.Id);

        await world.Page.OpenSavedAsync(saved);

        Assert.StartsWith("The saved search 'Heavy' can't be run.", world.Page.Error);
        Assert.Contains("Unknown field 'effort'", world.Page.Error);
        Assert.Empty(world.Page.Results);
    }

    [Fact]
    public async Task A_saved_search_for_a_deleted_project_reports_it_instead_of_crashing()
    {
        await using var world = await World.CreateAsync(withProject: true);
        var saved = await SaveAsync(world, "Gone", "type:error", scope: new SearchScope.Project(world.ProjectId!.Value));
        await world.Store.Projects.DeleteAsync(world.ProjectId.Value);

        await world.Page.OpenSavedAsync(saved);

        Assert.Contains("The saved search 'Gone' can't be run.", world.Page.Error);
        Assert.Contains("project does not exist", world.Page.Error);
    }

    [Fact]
    public async Task A_saved_search_with_a_deleted_choice_is_reported_by_the_choice()
    {
        await using var world = await World.CreateAsync();
        var saved = await SaveAsync(world, "Ghost", $"type:#{Guid.NewGuid():D}");

        await world.Page.OpenSavedAsync(saved);

        Assert.Contains("no longer exists", world.Page.Error);
    }

    private static async Task<SavedSearch> SaveAsync(
        World world, string name, string text, SearchScope? scope = null, bool includeCompleted = false)
    {
        var parsed = world.Store.Parser.Parse(text, await world.AllFieldsAsync(), await world.AllChoicesAsync());
        var query = parsed.Succeeded ? parsed.StableText : text;
        var definition = new SavedSearchDefinition(query, scope ?? new SearchScope.AllProjects(), includeCompleted);
        return await world.Service.SaveAsync(name, definition, overwrite: true);
    }

    private sealed class World : IAsyncDisposable
    {
        private World(PresentationTestStore store, SearchViewModel page, FakeDialogService dialogs,
            FakeNavigationService navigation, Guid? projectId)
        {
            Store = store;
            Page = page;
            Dialogs = dialogs;
            Navigation = navigation;
            ProjectId = projectId;
        }

        public PresentationTestStore Store { get; }

        public SearchViewModel Page { get; }

        public FakeDialogService Dialogs { get; }

        public FakeNavigationService Navigation { get; }

        public Guid? ProjectId { get; }

        public SavedSearchService Service => Store.SavedSearches;

        public static async Task<World> CreateAsync(bool withProject = false)
        {
            var store = new PresentationTestStore(new FakeTimeProvider(Now));
            await store.InitializeAsync();
            var project = withProject ? await store.Projects.CreateAsync("Billing") : null;
            var dialogs = new FakeDialogService();
            var navigation = new FakeNavigationService();
            var search = new ItemSearchService(store.UnitOfWorkFactory, new ItemQueryValidator(store.UnitOfWorkFactory));
            var page = SearchTestShell.CreatePage(store, search, navigation, project?.Id, null,
                withSyntax: true, dialogs: dialogs);
            await page.LoadAsync();
            return new World(store, page, dialogs, navigation, project?.Id);
        }

        public async Task<IReadOnlyList<SearchableField>> AllFieldsAsync()
        {
            var registry = new FieldRegistry(Store.UnitOfWorkFactory);
            return await registry.GetFieldsAsync(new SearchScope.AllProjects());
        }

        public async Task<IReadOnlyDictionary<string, IReadOnlyList<SearchChoice>>> AllChoicesAsync()
        {
            var registry = new FieldRegistry(Store.UnitOfWorkFactory);
            var choices = new Dictionary<string, IReadOnlyList<SearchChoice>>();

            foreach (var field in (await AllFieldsAsync()).Where(field => field.DataType == FieldDataType.Choice))
            {
                choices[field.Key] = await registry.GetChoicesAsync(field);
            }

            return choices;
        }

        /// <summary>The labels a stored query text resolves to, so tests can compare without ids.</summary>
        public async Task<string> StoredLabelsAsync(SavedSearch saved)
        {
            var parsed = Store.Parser.Parse(saved.QueryText, await AllFieldsAsync(), await AllChoicesAsync());
            var types = await Store.Lookups.ItemTypesAsync();
            var choice = (FilterValue.Choice)parsed.Filters.Single().Value!;
            return types.Single(type => type.Id == choice.Id).Name;
        }

        public async Task CreateItemAsync(string title, string type, string priority)
        {
            var item = await Store.Items.CreateAsync(ProjectId ?? (await Store.Projects.CreateAsync("Billing")).Id,
                null, null, title);
            var typeId = (await Store.Lookups.ItemTypesAsync()).Single(row => row.Name == type).Id;
            var priorityId = (await Store.Lookups.PriorityLevelsAsync()).Single(row => row.Name == priority).Id;
            await Store.Items.EditAsync(item.Id,
                new ItemEdit(title, null, null, typeId, priorityId, null, null, null, null));
        }

        public Task WaitForListAsync(int count)
        {
            return WaitUntilAsync(() => Page.SavedSearches!.Items.Count == count);
        }

        public Task WaitForConfirmAsync()
        {
            return WaitUntilAsync(() => Dialogs.ConfirmTitles.Count == 1);
        }

        public async Task WaitUntilAsync(Func<bool> condition)
        {
            for (var attempt = 0; attempt < 300 && !condition(); attempt++)
            {
                await Task.Delay(10);
            }

            Assert.True(condition(), "The condition was not met in time.");
            await Task.Delay(30);
        }

        public ValueTask DisposeAsync()
        {
            Page.Dispose();
            return Store.DisposeAsync();
        }
    }
}