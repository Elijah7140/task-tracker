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

public sealed class AreaItemsViewModelTests
{
    [Fact]
    public async Task Dropping_a_child_between_roots_promotes_it_and_keeps_it_selected()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var child = await store.Items.CreateAsync(project.Id, null, first.Id, "Child");
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();

        await page.DropItemAsync(child.Id, second.Id, ItemDropPosition.Before);
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Equal([first.Id, child.Id, second.Id], snapshot.Items.Select(node => node.Item.Id));
        Assert.True(page.OpenItems.Single(row => row.Id == child.Id).IsSelected);
    }

    [Fact]
    public async Task Cancelling_dirty_draft_guard_leaves_drop_unapplied_and_draft_intact()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var dialogs = new FakeDialogService { DraftResult = DraftDecision.Cancel };
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == first.Id));
        page.Editor!.Title = "Unsaved title";

        await page.DropItemAsync(first.Id, second.Id, ItemDropPosition.After);
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Equal([first.Id, second.Id], snapshot.Items.Select(node => node.Item.Id));
        Assert.Equal("Unsaved title", page.Editor.Title);
    }

    [Fact]
    public async Task Stale_drop_shows_core_error_inline()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await store.Items.DeleteAsync(project.Id, null, first.Id);

        await page.DropItemAsync(first.Id, second.Id, ItemDropPosition.After);

        Assert.NotNull(page.ItemMoveError);
        Assert.True(page.HasItemMoveError);
    }
    [Fact]
    public async Task Quick_add_creates_a_top_level_item_in_the_selected_area()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var folder = await store.Folders.CreateAsync(project.Id, null, "dbo");
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync(folder.Id);
        page.QuickAddTitle = "Create index";

        await page.QuickAddAsync();
        var snapshot = await store.Items.LoadAreaAsync(project.Id, folder.Id);

        Assert.Empty(page.QuickAddTitle);
        Assert.Equal("Create index", Assert.Single(snapshot.Items).Item.Title);
        Assert.Equal("Create index", Assert.Single(page.OpenItems).Title);
    }

    [Fact]
    public async Task Finished_children_and_roots_enter_their_completed_sections()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await store.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        var finished = await store.Items.CreateAsync(project.Id, null, null, "Finished");
        await store.Items.SetCompletedAsync(project.Id, null, child.Id, true);
        await store.Items.SetCompletedAsync(project.Id, null, finished.Id, true);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);

        await page.LoadAsync();

        Assert.Equal("Completed (2)", page.CompletedLabel);
        Assert.Empty(page.OpenItems);
        Assert.False(page.IsCompletedExpanded);
        Assert.Contains(page.CompletedItems, row => row.Id == parent.Id && row.CompletedCount == 1);
    }

    [Fact]
    public async Task Completing_a_parent_requires_confirmation_for_open_sub_items()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        await store.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        var dialogs = new FakeDialogService();
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync();

        await page.ToggleAsync(Assert.Single(page.OpenItems));
        var declined = await store.Items.LoadAreaAsync(project.Id, null);
        dialogs.ConfirmResult = true;
        await page.ToggleAsync(Assert.Single(page.OpenItems));

        Assert.False(declined.Items[0].IsFinished);
        Assert.Single(page.CompletedItems);
        Assert.Empty(page.OpenItems);
    }

    [Fact]
    public async Task Confirmed_delete_removes_the_selected_item_and_its_sub_items()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        await store.Items.CreateAsync(project.Id, null, item.Id, "Child");
        var dialogs = new FakeDialogService { ConfirmResult = true };
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync();
        await page.SelectItemAsync(Assert.Single(page.OpenItems));

        await page.DeleteItemAsync();
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Empty(snapshot.Items);
        Assert.Empty(page.OpenItems);
    }

    [Fact]
    public async Task Reordering_selected_items_changes_sibling_order()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == second.Id));

        await page.ReorderSelectedAsync(-1);
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Equal([second.Id, first.Id], snapshot.Items.Select(node => node.Item.Id));
    }

    [Fact]
    public async Task Completed_parent_with_open_child_stays_in_open_list_when_auto_complete_is_off()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.AutoCompleteParents, false);
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        await store.Items.CreateAsync(project.Id, null, parent.Id, "Open child");
        await store.Items.SetCompletedAsync(project.Id, null, parent.Id, true);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);

        await page.LoadAsync();

        Assert.True(Assert.Single(page.OpenItems).IsComplete);
        Assert.Empty(page.CompletedItems);
    }

    [Fact]
    public async Task Reopening_finished_parent_shows_the_core_blocked_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await store.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        await store.Items.SetCompletedAsync(project.Id, null, child.Id, true);
        var dialogs = new FakeDialogService();
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync();

        await page.ToggleAsync(Assert.Single(page.CompletedItems));

        Assert.Contains(dialogs.Messages, message => message.Contains("Reopen a sub-item", StringComparison.Ordinal));
        Assert.Single(page.CompletedItems);
    }

    [Fact]
    public async Task Declined_delete_keeps_item_and_sub_items()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        await store.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(Assert.Single(page.OpenItems));

        await page.DeleteItemAsync();
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Single(snapshot.Items);
        Assert.Single(snapshot.Items[0].Children);
    }

    [Fact]
    public async Task Completed_section_orders_newest_first_and_starts_collapsed()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var older = await store.Items.CreateAsync(project.Id, null, null, "Older");
        var newer = await store.Items.CreateAsync(project.Id, null, null, "Newer");
        await store.Items.SetCompletedAsync(project.Id, null, older.Id, true);
        clock.Advance(TimeSpan.FromMinutes(1));
        await store.Items.SetCompletedAsync(project.Id, null, newer.Id, true);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, clock: clock);

        await page.LoadAsync();

        Assert.Equal([newer.Id, older.Id], page.CompletedItems.Select(row => row.Id));
        Assert.False(page.IsCompletedExpanded);
    }

    [Fact]
    public async Task Finished_child_appears_in_collapsed_sub_item_section()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        var finished = await store.Items.CreateAsync(project.Id, null, parent.Id, "Finished");
        await store.Items.CreateAsync(project.Id, null, parent.Id, "Open");
        await store.Items.SetCompletedAsync(project.Id, null, finished.Id, true);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);

        await page.LoadAsync();
        var row = Assert.Single(page.OpenItems);

        Assert.Equal("1 completed", row.CompletedLabel);
        Assert.False(row.IsCompletedExpanded);
        Assert.Equal(finished.Id, Assert.Single(row.CompletedChildren).Id);
    }

    [Fact]
    public async Task Quick_add_is_canceled_when_the_editor_draft_is_kept()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Items.CreateAsync(project.Id, null, null, "Original");
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(Assert.Single(page.OpenItems));
        page.Editor!.Title = "Draft";
        page.QuickAddTitle = "New";

        await page.QuickAddAsync();

        Assert.Single(page.OpenItems);
        Assert.Equal("Draft", page.Editor.Title);
    }

    [Fact]
    public async Task Adding_a_sub_item_expands_its_collapsed_parent()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        var dialogs = new FakeDialogService { PromptResult = "Child" };
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync();
        await page.SelectItemAsync(Assert.Single(page.OpenItems));

        await page.AddSubItemAsync();

        Assert.True(Assert.Single(page.OpenItems).IsExpanded);
        Assert.True(Assert.Single(page.OpenItems[0].Children).IsSelected);
        Assert.Equal(parent.Id, page.OpenItems[0].Id);
    }

    [Fact]
    public async Task Reorder_moves_only_among_visible_open_siblings()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var first = await store.Items.CreateAsync(project.Id, null, null, "A");
        var finished = await store.Items.CreateAsync(project.Id, null, null, "B");
        var last = await store.Items.CreateAsync(project.Id, null, null, "C");
        await store.Items.SetCompletedAsync(project.Id, null, finished.Id, true);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == first.Id));

        await page.ReorderSelectedAsync(1);
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Equal([last.Id, finished.Id, first.Id], snapshot.Items.Select(node => node.Item.Id));
    }
}