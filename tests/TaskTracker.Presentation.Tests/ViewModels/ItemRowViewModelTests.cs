#pragma warning disable xUnit1051
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class ItemRowViewModelTests
{
    [Fact]
    public async Task Row_details_join_the_ticket_priority_and_date_on_one_line()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await store.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        await store.Items.EditAsync(child.Id, new ItemEdit("Child", null, "DB-7", null, BuiltInLookups.HighId,
            new DateOnly(2030, 1, 15), null, null, null));
        var plain = await store.Items.CreateAsync(project.Id, null, null, "Plain");
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);

        await page.LoadAsync();
        var childRow = page.OpenItems.Single(row => row.Id == parent.Id).Children.Single();
        var plainRow = page.OpenItems.Single(row => row.Id == plain.Id);

        Assert.Equal("DB-7 · High · 1/15/2030", childRow.RowDetails);
        Assert.True(childRow.HasRowDetails);
        Assert.False(plainRow.HasRowDetails);
        Assert.False(plainRow.HasType);
    }
}