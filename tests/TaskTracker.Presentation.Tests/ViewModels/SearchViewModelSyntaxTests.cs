#pragma warning disable xUnit1051
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Search;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class SearchViewModelSyntaxTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Plain_words_in_the_box_search_as_free_text_without_adding_rows()
    {
        await using var world = await World.CreateAsync();
        await world.CreateItemAsync("Review invoice");
        await world.CreateItemAsync("Other");

        world.Page.QueryText = "invoice";
        await world.Page.SubmitAsync();

        Assert.Equal("invoice", world.Page.Text);
        Assert.Empty(world.Page.Filters);
        Assert.Equal(["Review invoice"], world.Page.Results.Select(row => row.Title));
    }

    [Fact]
    public async Task Entering_syntax_rebuilds_the_filter_rows_and_searches_with_them()
    {
        await using var world = await World.CreateAsync();
        await world.CreateItemAsync("Fix deadlock", "Error", "High");
        await world.CreateItemAsync("Tidy deadlock", "Error", "Low");
        await world.CreateItemAsync("Discuss deadlock", "Discussion", "High");

        world.Page.QueryText = "deadlock type:error priority>=high";
        await world.Page.SubmitAsync();

        Assert.Equal("deadlock", world.Page.Text);
        Assert.Equal(2, world.Page.Filters.Count);
        var type = world.Page.Filters[0];
        Assert.Equal("type", type.SelectedField?.Key);
        Assert.Equal("Error", type.SelectedChoice?.Label);
        var priority = world.Page.Filters[1];
        Assert.Equal(FilterOperator.Between, priority.SelectedOperator?.Operator);
        Assert.Equal("Critical", priority.SelectedChoice?.Label);
        Assert.Equal("High", priority.SecondChoice?.Label);
        Assert.Equal(["Fix deadlock"], world.Page.Results.Select(row => row.Title));
    }

    [Fact]
    public async Task Typed_text_stays_as_written_after_it_is_applied()
    {
        await using var world = await World.CreateAsync();

        world.Page.QueryText = "due<today";
        await world.Page.SubmitAsync();

        Assert.Equal("due<today", world.Page.QueryText);
        var row = Assert.Single(world.Page.Filters);
        Assert.Equal(new DateTime(2026, 11, 13), row.FirstDate);
    }

    [Fact]
    public async Task A_parse_error_shows_inline_and_nothing_runs()
    {
        var search = new CountingSearch();
        await using var world = await World.CreateAsync(search);

        world.Page.QueryText = "ok tpye:error";
        await world.Page.SubmitAsync();

        Assert.Equal(0, search.Calls);
        Assert.Contains("Unknown field 'tpye'. Did you mean 'type'?", world.Page.Error);
        Assert.Contains("at \"tpye:error\", character 4", world.Page.Error);
    }

    [Fact]
    public async Task Several_parse_errors_are_all_listed_one_per_line()
    {
        await using var world = await World.CreateAsync();

        world.Page.QueryText = "effort:x zzz:1";
        await world.Page.SubmitAsync();

        var lines = world.Page.Error!.Split('\n');
        Assert.Equal(2, lines.Length);
    }

    [Fact]
    public async Task A_successful_run_clears_the_previous_error()
    {
        await using var world = await World.CreateAsync();
        world.Page.QueryText = "zzz:1";
        await world.Page.SubmitAsync();
        Assert.NotNull(world.Page.Error);

        world.Page.QueryText = "type:error";
        await world.Page.SubmitAsync();

        Assert.Null(world.Page.Error);
    }

    [Fact]
    public async Task Is_done_turns_on_include_completed()
    {
        await using var world = await World.CreateAsync();

        world.Page.QueryText = "is:done";
        await world.Page.SubmitAsync();

        Assert.True(world.Page.IncludeCompleted);
        Assert.Equal("status", Assert.Single(world.Page.Filters).SelectedField?.Key);
    }

    [Fact]
    public async Task Editing_a_filter_row_rewrites_the_text_in_canonical_form()
    {
        await using var world = await World.CreateAsync();
        await world.Page.LoadAsync();
        world.Page.AddFilterCommand.Execute(null);
        var row = Assert.Single(world.Page.Filters);

        row.SelectedField = world.Field("title");
        row.SelectedOperator = row.Operators.Single(option => option.Operator == FilterOperator.Contains);
        row.FirstText = "dead lock";

        Assert.Equal("title~\"dead lock\"", world.Page.QueryText);
    }

    [Fact]
    public async Task Choosing_a_choice_in_a_row_writes_its_label_into_the_text()
    {
        await using var world = await World.CreateAsync();
        await world.Page.LoadAsync();
        world.Page.AddFilterCommand.Execute(null);
        var row = Assert.Single(world.Page.Filters);

        row.SelectedField = world.Field("priority");
        await row.ChoicesTask;
        row.SelectedChoice = row.Choices.Single(choice => choice.Label == "High");

        Assert.Equal("priority:High", world.Page.QueryText);
    }

    [Fact]
    public async Task Incomplete_rows_are_left_out_of_the_text_and_removing_a_row_updates_it()
    {
        await using var world = await World.CreateAsync();
        world.Page.QueryText = "ticket:A-1 no:due";
        await world.Page.SubmitAsync();
        world.Page.AddFilterCommand.Execute(null);

        Assert.Equal("ticket:A-1 no:due", world.Page.QueryText);
        world.Page.Filters[0].RemoveCommand.Execute(null);

        Assert.Equal("no:due", world.Page.QueryText);
    }

    [Fact]
    public async Task Setting_the_free_text_updates_the_box_and_filters_follow_it()
    {
        await using var world = await World.CreateAsync();
        world.Page.QueryText = "type:error";
        await world.Page.SubmitAsync();

        world.Page.Text = "deadlock";

        Assert.Equal("deadlock type:Error", world.Page.QueryText);
    }

    [Fact]
    public async Task Entering_text_that_drops_a_filter_removes_its_row()
    {
        await using var world = await World.CreateAsync();
        world.Page.QueryText = "type:error";
        await world.Page.SubmitAsync();

        world.Page.QueryText = "deadlock";
        await world.Page.SubmitAsync();

        Assert.Empty(world.Page.Filters);
        Assert.Equal("deadlock", world.Page.Text);
    }

    [Fact]
    public async Task Without_a_parser_the_box_is_plain_free_text()
    {
        await using var world = await World.CreateAsync(withSyntax: false);

        world.Page.QueryText = "type:error";
        await world.Page.SubmitAsync();

        Assert.Equal("type:error", world.Page.Text);
        Assert.Empty(world.Page.Filters);
    }

    [Fact]
    public async Task Newer_submission_wins_when_older_choice_loading_finishes_late()
    {
        var registry = new GatedRegistry();
        await using var world = await World.CreateAsync(registry: registry);
        world.Page.QueryText = "type:Error";
        var first = world.Page.SubmitAsync();
        await registry.FirstChoiceRequested;

        world.Page.QueryText = "type:Discussion";
        await world.Page.SubmitAsync();
        registry.ReleaseFirstChoice();
        await first;

        Assert.Equal("type:Discussion", world.Page.QueryText);
        Assert.Equal("Discussion", Assert.Single(world.Page.Filters).SelectedChoice?.Label);
    }

    private sealed class GatedRegistry : IFieldRegistry
    {
        private readonly TaskCompletionSource requested = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource released = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private IFieldRegistry? inner;
        private int choiceCalls;

        public Task FirstChoiceRequested => requested.Task;

        public void SetInner(IFieldRegistry registry)
        {
            inner = registry;
        }

        public void ReleaseFirstChoice()
        {
            released.SetResult();
        }

        public Task<IReadOnlyList<SearchableField>> GetFieldsAsync(SearchScope scope,
            CancellationToken cancellationToken = default)
        {
            return inner!.GetFieldsAsync(scope, cancellationToken);
        }

        public async Task<IReadOnlyList<SearchChoice>> GetChoicesAsync(SearchableField field,
            CancellationToken cancellationToken = default)
        {
            if (Interlocked.Increment(ref choiceCalls) == 1)
            {
                requested.SetResult();
                await released.Task;
            }

            return await inner!.GetChoicesAsync(field, cancellationToken);
        }
    }

    private sealed class CountingSearch : IItemSearchService
    {
        public int Calls { get; private set; }

        public Task<ItemSearchResults> SearchAsync(ItemQuery query, int limit = 200,
            CancellationToken cancellationToken = default)
        {
            Calls++;
            return Task.FromResult(new ItemSearchResults([], false));
        }
    }

    /// <summary>A database, a clock fixed at 2026-11-13 and a search page that understands the syntax.</summary>
    private sealed class World : IAsyncDisposable
    {
        private readonly PresentationTestStore store;

        private readonly Guid projectId;

        private World(PresentationTestStore store, SearchViewModel page, Guid projectId)
        {
            this.store = store;
            this.projectId = projectId;
            Page = page;
        }

        public SearchViewModel Page { get; }

        public static async Task<World> CreateAsync(IItemSearchService? search = null, bool withSyntax = true,
            GatedRegistry? registry = null)
        {
            var store = new PresentationTestStore(new FakeTimeProvider(Now));
            await store.InitializeAsync();
            search ??= new ItemSearchService(store.UnitOfWorkFactory, new ItemQueryValidator(store.UnitOfWorkFactory));
            registry?.SetInner(new FieldRegistry(store.UnitOfWorkFactory));
            var page = SearchTestShell.CreatePage(store, search, withSyntax: withSyntax, registry: registry);
            await page.LoadAsync();
            var project = await store.Projects.CreateAsync("Billing");
            return new World(store, page, project.Id);
        }

        public SearchableField Field(string key)
        {
            return Page.Filters[0].Fields.Single(field => field.Key == key);
        }

        public async Task CreateItemAsync(string title, string? type = null, string? priority = null)
        {
            var item = await store.Items.CreateAsync(projectId, null, null, title);
            var typeId = await FindTypeAsync(type);
            var priorityId = await FindPriorityAsync(priority);
            var edit = new ItemEdit(title, null, null, typeId, priorityId, null, null, null, null);
            await store.Items.EditAsync(item.Id, edit);
        }

        private async Task<Guid?> FindTypeAsync(string? name)
        {
            var types = await store.Lookups.ItemTypesAsync();
            return types.FirstOrDefault(type => type.Name == name)?.Id;
        }

        private async Task<Guid?> FindPriorityAsync(string? name)
        {
            var levels = await store.Lookups.PriorityLevelsAsync();
            return levels.FirstOrDefault(level => level.Name == name)?.Id;
        }

        public ValueTask DisposeAsync()
        {
            Page.Dispose();
            return store.DisposeAsync();
        }
    }
}