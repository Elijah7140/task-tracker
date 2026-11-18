#pragma warning disable xUnit1051
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Settings;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>The workspace's priority card grid: sections, card moves and the column setting.</summary>
public sealed class ProjectWorkspaceViewModelCardTests
{
    [Fact]
    public async Task Alt_down_at_a_section_end_moves_the_card_into_the_next_section_and_sets_its_priority()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var plain = await store.Items.CreateAsync(project.Id, null, null, "Plain");
        var high = await PriorityGroupBuilderTests.CreateWithPriorityAsync(store, project.Id, "High", BuiltInLookups.HighId);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == plain.Id));

        await page.ReorderSelectedAsync(1);

        var section = Assert.Single(page.OpenGroups);
        Assert.Equal(BuiltInLookups.HighId, section.PriorityLevelId);
        Assert.Equal([plain.Id, high], section.Cards.Select(card => card.Id));
        Assert.True(section.Cards[0].IsSelected);
        Assert.Equal("Set priority of 'Plain'", store.History.UndoDescription);
    }

    [Fact]
    public async Task Alt_up_inside_a_section_reorders_without_changing_priority()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var first = await PriorityGroupBuilderTests.CreateWithPriorityAsync(store, project.Id, "First", BuiltInLookups.LowId);
        var second = await PriorityGroupBuilderTests.CreateWithPriorityAsync(store, project.Id, "Second", BuiltInLookups.LowId);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == second));

        await page.ReorderSelectedAsync(-1);

        var section = Assert.Single(page.OpenGroups);
        Assert.Equal(BuiltInLookups.LowId, section.PriorityLevelId);
        Assert.Equal([second, first], section.Cards.Select(card => card.Id));
    }

    [Fact]
    public async Task Dropping_on_a_section_header_appends_the_item_and_one_undo_restores_it()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var plain = await store.Items.CreateAsync(project.Id, null, null, "Plain");
        var high = await PriorityGroupBuilderTests.CreateWithPriorityAsync(store, project.Id, "High", BuiltInLookups.HighId);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        var highSection = page.OpenGroups.Single(group => group.PriorityLevelId == BuiltInLookups.HighId);

        await page.DropItemOnGroupAsync(plain.Id, highSection);
        var afterDrop = page.OpenGroups.Single().Cards.Select(card => card.Id).ToArray();
        await store.History.UndoAsync();
        await page.LoadItemsAsync();

        Assert.Equal([high, plain.Id], afterDrop);
        Assert.Equal([PriorityGroupBuilder.NoPriorityTitle, "High"], page.OpenGroups.Select(group => group.Title));
    }

    [Fact]
    public async Task Dropping_a_sub_item_beside_a_card_promotes_it_into_that_cards_section()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await store.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        var high = await PriorityGroupBuilderTests.CreateWithPriorityAsync(store, project.Id, "High", BuiltInLookups.HighId);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();

        await page.DropItemAsync(child.Id, high, ItemDropPosition.Before);

        var highSection = page.OpenGroups.Single(group => group.PriorityLevelId == BuiltInLookups.HighId);
        Assert.Equal([child.Id, high], highSection.Cards.Select(card => card.Id));
        Assert.Empty(page.OpenItems.Single(row => row.Id == parent.Id).Children);
    }

    [Fact]
    public async Task Dropping_into_the_middle_of_a_card_still_makes_a_sub_item()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();

        await page.DropItemAsync(second.Id, first.Id, ItemDropPosition.Into);

        var card = Assert.Single(Assert.Single(page.OpenGroups).Cards);
        Assert.Equal([second.Id], card.Children.Select(row => row.Id));
    }

    [Fact]
    public async Task Card_columns_follow_the_global_setting()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        var initial = page.CardColumns;

        await store.Settings.SetGlobalAsync(SettingsCatalogue.WorkspaceCardColumns, 6);
        await page.LoadItemsAsync();

        Assert.Equal(4, initial);
        Assert.Equal(6, page.CardColumns);
    }
}