#pragma warning disable xUnit1051
using TaskTracker.Core.Lookups;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class PriorityGroupBuilderTests
{
    [Fact]
    public async Task No_priority_comes_first_then_levels_in_list_order_and_empty_levels_are_left_out()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var low = await CreateWithPriorityAsync(store, project.Id, "Low task", BuiltInLookups.LowId);
        var plain = await store.Items.CreateAsync(project.Id, null, null, "Plain");
        var critical = await CreateWithPriorityAsync(store, project.Id, "Critical task", BuiltInLookups.CriticalId);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);

        await page.LoadAsync();

        Assert.Equal([PriorityGroupBuilder.NoPriorityTitle, "Critical", "Low"], page.OpenGroups.Select(group => group.Title));
        Assert.Equal([null, BuiltInLookups.CriticalId, BuiltInLookups.LowId], page.OpenGroups.Select(group => group.PriorityLevelId));
        Assert.Equal([plain.Id], page.OpenGroups[0].Cards.Select(card => card.Id));
        Assert.Equal([critical], page.OpenGroups[1].Cards.Select(card => card.Id));
        Assert.Equal([low], page.OpenGroups[2].Cards.Select(card => card.Id));
    }

    [Fact]
    public async Task Sections_follow_level_sort_order_not_level_number()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var one = await store.Lookups.AddPriorityLevelAsync("", 1);
        var seven = await store.Lookups.AddPriorityLevelAsync("", 7);
        var two = await store.Lookups.AddPriorityLevelAsync("", 2);
        await CreateWithPriorityAsync(store, project.Id, "Two", two.Id);
        await CreateWithPriorityAsync(store, project.Id, "Seven", seven.Id);
        await CreateWithPriorityAsync(store, project.Id, "One", one.Id);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);

        await page.LoadAsync();

        Assert.Equal(["1", "7", "2"], page.OpenGroups.Select(group => group.Title));
    }

    [Fact]
    public async Task Completed_items_are_not_cards_in_a_section_and_sub_items_stay_inside_their_card()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await store.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        var done = await store.Items.CreateAsync(project.Id, null, null, "Done");
        await store.Items.SetCompletedAsync(project.Id, null, done.Id, true);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);

        await page.LoadAsync();

        var card = Assert.Single(Assert.Single(page.OpenGroups).Cards);
        Assert.Equal(parent.Id, card.Id);
        Assert.Equal([child.Id], card.Children.Select(row => row.Id));
        Assert.Equal("1 item", page.OpenGroups[0].CountLabel);
    }

    internal static async Task<Guid> CreateWithPriorityAsync(PresentationTestStore store, Guid projectId,
        string title, Guid priorityId)
    {
        var item = await store.Items.CreateAsync(projectId, null, null, title);
        await store.Items.SetPriorityAsync(item.Id, priorityId);
        return item.Id;
    }
}