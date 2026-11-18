#pragma warning disable xUnit1051
using TaskTracker.Core.Lookups;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class CardDropMapperTests
{
    [Fact]
    public async Task Dropping_after_a_card_in_another_section_takes_its_priority_and_place()
    {
        await using var grid = await CardGrid.CreateAsync();

        var placement = CardDropMapper.Map(grid.Rows, grid.Page.OpenGroups, grid.Plain, grid.HighFirst, ItemDropPosition.After);

        Assert.Equal(new CardPlacement(BuiltInLookups.HighId, 1), placement);
    }

    [Fact]
    public async Task Dropping_before_a_card_in_its_own_section_keeps_the_priority()
    {
        await using var grid = await CardGrid.CreateAsync();

        var placement = CardDropMapper.Map(grid.Rows, grid.Page.OpenGroups, grid.HighSecond, grid.HighFirst, ItemDropPosition.Before);

        Assert.Equal(new CardPlacement(BuiltInLookups.HighId, 0), placement);
    }

    [Fact]
    public async Task Into_a_card_onto_itself_and_from_a_finished_item_are_not_card_placements()
    {
        await using var grid = await CardGrid.CreateAsync();
        await grid.Store.Items.SetCompletedAsync(grid.ProjectId, null, grid.HighSecond, true);
        await grid.Page.LoadItemsAsync();

        var into = CardDropMapper.Map(grid.Rows, grid.Page.OpenGroups, grid.Plain, grid.HighFirst, ItemDropPosition.Into);
        var self = CardDropMapper.Map(grid.Rows, grid.Page.OpenGroups, grid.Plain, grid.Plain, ItemDropPosition.After);
        var finished = CardDropMapper.Map(grid.Rows, grid.Page.OpenGroups, grid.HighSecond, grid.HighFirst, ItemDropPosition.After);

        Assert.Null(into);
        Assert.Null(self);
        Assert.Null(finished);
    }

    [Fact]
    public async Task Stepping_down_inside_a_section_swaps_with_the_next_card()
    {
        await using var grid = await CardGrid.CreateAsync();

        var placement = CardDropMapper.Step(grid.Rows, grid.Page.OpenGroups, grid.HighFirst, 1);

        Assert.Equal(new CardPlacement(BuiltInLookups.HighId, 2), placement);
    }

    [Fact]
    public async Task Stepping_down_from_a_section_end_enters_the_next_section_at_its_start()
    {
        await using var grid = await CardGrid.CreateAsync();

        var placement = CardDropMapper.Step(grid.Rows, grid.Page.OpenGroups, grid.Plain, 1);

        Assert.Equal(new CardPlacement(BuiltInLookups.HighId, 0), placement);
    }

    [Fact]
    public async Task Stepping_up_from_a_section_start_enters_the_previous_section_at_its_end()
    {
        await using var grid = await CardGrid.CreateAsync();

        var placement = CardDropMapper.Step(grid.Rows, grid.Page.OpenGroups, grid.HighFirst, -1);

        Assert.Equal(new CardPlacement(null, 1), placement);
    }

    [Fact]
    public async Task Stepping_past_either_end_of_the_grid_does_nothing()
    {
        await using var grid = await CardGrid.CreateAsync();

        var up = CardDropMapper.Step(grid.Rows, grid.Page.OpenGroups, grid.Plain, -1);
        var down = CardDropMapper.Step(grid.Rows, grid.Page.OpenGroups, grid.HighSecond, 1);

        Assert.Null(up);
        Assert.Null(down);
    }

    [Fact]
    public async Task A_header_drop_appends_after_the_sections_last_other_card()
    {
        await using var grid = await CardGrid.CreateAsync();
        var high = grid.Page.OpenGroups.Single(group => group.PriorityLevelId == BuiltInLookups.HighId);

        var placement = CardDropMapper.MapToGroupEnd(grid.Rows, grid.Page.OpenGroups, grid.Plain, high);
        var onlyItself = CardDropMapper.MapToGroupEnd(grid.Rows, grid.Page.OpenGroups, grid.Plain, grid.Page.OpenGroups[0]);

        Assert.Equal(new CardPlacement(BuiltInLookups.HighId, 2), placement);
        Assert.Null(onlyItself);
    }

    /// <summary>
    /// Top-level sort order: High first, Plain (no priority), High second. The grid shows the
    /// sections "No priority" [Plain] and "High" [High first, High second].
    /// </summary>
    private sealed class CardGrid : IAsyncDisposable
    {
        private CardGrid(PresentationTestStore store, ProjectWorkspaceViewModel page, Guid projectId,
            Guid highFirst, Guid plain, Guid highSecond)
        {
            Store = store;
            Page = page;
            ProjectId = projectId;
            HighFirst = highFirst;
            Plain = plain;
            HighSecond = highSecond;
        }

        public PresentationTestStore Store { get; }

        public ProjectWorkspaceViewModel Page { get; }

        public Guid ProjectId { get; }

        public Guid HighFirst { get; }

        public Guid Plain { get; }

        public Guid HighSecond { get; }

        public IReadOnlyList<ItemRowViewModel> Rows => Page.OpenItems.Concat(Page.CompletedItems).ToArray();

        public static async Task<CardGrid> CreateAsync()
        {
            var store = new PresentationTestStore();
            await store.InitializeAsync();
            var project = await store.Projects.CreateAsync("Project");
            var highFirst = await PriorityGroupBuilderTests.CreateWithPriorityAsync(store, project.Id, "High first", BuiltInLookups.HighId);
            var plain = (await store.Items.CreateAsync(project.Id, null, null, "Plain")).Id;
            var highSecond = await PriorityGroupBuilderTests.CreateWithPriorityAsync(store, project.Id, "High second", BuiltInLookups.HighId);
            var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
            await page.LoadAsync();
            return new CardGrid(store, page, project.Id, highFirst, plain, highSecond);
        }

        public async ValueTask DisposeAsync()
        {
            Page.Dispose();
            await Store.DisposeAsync();
        }
    }
}