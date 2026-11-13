#pragma warning disable xUnit1051
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Urgency;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class ItemEditorViewModelTests
{
    [Fact]
    public async Task Saving_and_reverting_editor_changes_uses_a_fresh_snapshot()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Original");
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(Assert.Single(page.OpenItems));
        page.Editor!.Title = "Saved";

        Assert.True(await page.SaveAsync());
        page.Editor!.Title = "Discarded";
        page.Revert();
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Equal(item.Id, page.Editor!.Id);
        Assert.Equal("Saved", page.Editor.Title);
        Assert.Equal("Saved", snapshot.Items[0].Item.Title);
    }

    [Fact]
    public async Task Archived_lookups_remain_visible_but_are_absent_from_editor_choices()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Task");
        var type = await store.Lookups.AddItemTypeAsync("Legacy");
        var priority = await store.Lookups.AddPriorityLevelAsync("Old rank");
        await store.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, null,
            type.Id, priority.Id, null, null, null, null));
        await store.Lookups.ArchiveItemTypeAsync(type.Id);
        await store.Lookups.ArchivePriorityLevelAsync(priority.Id);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();

        await page.SelectItemAsync(Assert.Single(page.OpenItems));

        Assert.Equal("Legacy", page.Editor!.ArchivedTypeName);
        Assert.Equal("Old rank", page.Editor.ArchivedPriorityName);
        Assert.DoesNotContain(page.ItemTypes, choice => choice.Id == type.Id);
        Assert.DoesNotContain(page.PriorityLevels, choice => choice.Id == priority.Id);
    }

    [Fact]
    public async Task Invalid_editor_title_is_shown_and_not_saved()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Items.CreateAsync(project.Id, null, null, "Original");
        var dialogs = new FakeDialogService();
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync();
        await page.SelectItemAsync(Assert.Single(page.OpenItems));
        page.Editor!.Title = "  ";

        var saved = await page.SaveAsync();
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.False(saved);
        Assert.Equal("Original", snapshot.Items[0].Item.Title);
        Assert.Contains(dialogs.Messages, message => message.Contains("title", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task None_picker_entries_clear_type_and_priority()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Task");
        var type = (await store.Lookups.ItemTypesAsync()).First();
        var priority = (await store.Lookups.PriorityLevelsAsync()).First();
        await store.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, null,
            type.Id, priority.Id, null, null, null, null));
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(Assert.Single(page.OpenItems));

        page.Editor!.SelectedTypeOption = page.TypeOptions[0];
        page.Editor.SelectedPriorityOption = page.PriorityOptions[0];
        await page.SaveAsync();
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Null(snapshot.Items[0].Item.ItemTypeId);
        Assert.Null(snapshot.Items[0].Item.PriorityLevelId);
    }
}