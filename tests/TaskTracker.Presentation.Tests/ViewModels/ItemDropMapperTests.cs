#pragma warning disable xUnit1051
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class ItemDropMapperTests
{
    [Fact]
    public async Task Open_rows_are_placed_before_and_into_and_cycles_are_rejected()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var child = await store.Items.CreateAsync(project.Id, null, first.Id, "Child");
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        var rows = page.OpenItems.SelectMany(row => new[] { row }.Concat(row.Children)).ToArray();

        var before = ItemDropMapper.Map(rows, second.Id, first.Id, ItemDropPosition.Before);
        var into = ItemDropMapper.Map(rows, second.Id, first.Id, ItemDropPosition.Into);
        var cycle = ItemDropMapper.Map(rows, first.Id, child.Id, ItemDropPosition.Into);

        Assert.Equal(new ItemDropPlacement(null, 0), before);
        Assert.Equal(new ItemDropPlacement(first.Id, 1), into);
        Assert.Null(cycle);
    }

    [Fact]
    public async Task Before_and_after_are_rejected_on_a_completed_row_but_into_is_allowed()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var open = await store.Items.CreateAsync(project.Id, null, null, "Open");
        var completed = await store.Items.CreateAsync(project.Id, null, null, "Completed");
        await store.Items.SetCompletedAsync(project.Id, null, completed.Id, true);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        var rows = page.OpenItems.Concat(page.CompletedItems).ToArray();

        var before = ItemDropMapper.Map(rows, open.Id, completed.Id, ItemDropPosition.Before);
        var after = ItemDropMapper.Map(rows, open.Id, completed.Id, ItemDropPosition.After);
        var into = ItemDropMapper.Map(rows, open.Id, completed.Id, ItemDropPosition.Into);

        Assert.Null(before);
        Assert.Null(after);
        Assert.Equal(new ItemDropPlacement(completed.Id, 0), into);
    }

    [Fact]
    public async Task Reordering_between_two_completed_rows_is_rejected()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var older = await store.Items.CreateAsync(project.Id, null, null, "Older");
        var newer = await store.Items.CreateAsync(project.Id, null, null, "Newer");
        await store.Items.SetCompletedAsync(project.Id, null, older.Id, true);
        await store.Items.SetCompletedAsync(project.Id, null, newer.Id, true);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        var rows = page.CompletedItems.ToArray();

        var before = ItemDropMapper.Map(rows, older.Id, newer.Id, ItemDropPosition.Before);
        var after = ItemDropMapper.Map(rows, older.Id, newer.Id, ItemDropPosition.After);

        Assert.Null(before);
        Assert.Null(after);
    }

    [Fact]
    public async Task A_completed_row_cannot_be_placed_before_an_open_row()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var open = await store.Items.CreateAsync(project.Id, null, null, "Open");
        var completed = await store.Items.CreateAsync(project.Id, null, null, "Completed");
        await store.Items.SetCompletedAsync(project.Id, null, completed.Id, true);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        var rows = page.OpenItems.Concat(page.CompletedItems).ToArray();

        var before = ItemDropMapper.Map(rows, completed.Id, open.Id, ItemDropPosition.Before);

        Assert.Null(before);
    }
}