#pragma warning disable xUnit1051
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Item moves that are still saving while the user keeps working.</summary>
public sealed class ProjectWorkspaceViewModelMoveTests
{
    [Fact]
    public async Task Edits_typed_while_a_move_is_saving_survive_the_reload()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var gate = new GatedSaveUnitOfWorkFactory(store.UnitOfWorkFactory);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, gate);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == first.Id));
        gate.HoldNextSave();

        var move = page.DropItemAsync(second.Id, first.Id, ItemDropPosition.Before);
        await gate.WaitForHeldSaveAsync();
        page.Editor!.Title = "Typed during the move";
        gate.ReleaseHeldSave();
        await move;

        Assert.Equal("Typed during the move", page.Editor.Title);
        Assert.Equal(first.Id, page.Editor.Id);
        Assert.Equal([second.Id, first.Id], page.OpenItems.Select(row => row.Id));
        Assert.True(page.OpenItems.Single(row => row.Id == first.Id).IsSelected);
    }

    [Fact]
    public async Task A_second_move_requested_while_one_is_saving_is_ignored()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var gate = new GatedSaveUnitOfWorkFactory(store.UnitOfWorkFactory);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, gate);
        await page.LoadAsync();
        gate.HoldNextSave();

        var firstMove = page.DropItemAsync(second.Id, first.Id, ItemDropPosition.Before);
        await gate.WaitForHeldSaveAsync();
        await page.DropItemAsync(first.Id, second.Id, ItemDropPosition.Before);
        var finishedEarly = firstMove.IsCompleted;
        gate.ReleaseHeldSave();
        await firstMove;
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.False(finishedEarly);
        Assert.Equal([second.Id, first.Id], snapshot.Items.Select(node => node.Item.Id));
        Assert.Equal([second.Id, first.Id], page.OpenItems.Select(row => row.Id));
    }

    [Fact]
    public async Task Moving_a_row_then_navigating_away_leaves_the_new_area_untouched()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var area = await store.Folders.CreateAsync(project.Id, null, "Area");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var elsewhere = await store.Items.CreateAsync(project.Id, area.Id, null, "In the area");
        var gate = new GatedSaveUnitOfWorkFactory(store.UnitOfWorkFactory);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, gate);
        await page.LoadAsync();
        gate.HoldNextSave();

        var move = page.DropItemAsync(second.Id, first.Id, ItemDropPosition.Before);
        await gate.WaitForHeldSaveAsync();
        var areaNode = page.FolderRoots[0].Children.Single(node => node.Id == area.Id);
        await page.SelectAreaAsync(areaNode);
        gate.ReleaseHeldSave();
        await move;
        var rootSnapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Equal(area.Id, page.SelectedFolder?.Id);
        Assert.Equal([elsewhere.Id], page.OpenItems.Select(row => row.Id));
        Assert.Equal([second.Id, first.Id], rootSnapshot.Items.Select(node => node.Item.Id));
    }

    [Fact]
    public async Task Selecting_another_item_while_a_move_is_saving_keeps_that_selection()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var third = await store.Items.CreateAsync(project.Id, null, null, "Third");
        var gate = new GatedSaveUnitOfWorkFactory(store.UnitOfWorkFactory);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, gate);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == first.Id));
        gate.HoldNextSave();

        var move = page.DropItemAsync(third.Id, second.Id, ItemDropPosition.Before);
        await gate.WaitForHeldSaveAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == second.Id));
        gate.ReleaseHeldSave();
        await move;

        Assert.Equal(second.Id, page.Editor!.Id);
        Assert.True(page.OpenItems.Single(row => row.Id == second.Id).IsSelected);
        Assert.False(page.OpenItems.Single(row => row.Id == third.Id).IsSelected);
        Assert.Equal([first.Id, third.Id, second.Id], page.OpenItems.Select(row => row.Id));
    }
}