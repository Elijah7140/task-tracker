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

public sealed class ProjectWorkspaceViewModelTests
{
    [Fact]
    public async Task Creating_a_folder_persists_it_and_expands_its_parent()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var dialogs = new FakeDialogService { PromptResult = "Tables" };
        var page = CreatePage(store, project.Id, dialogs);
        await page.LoadAsync();
        page.FolderRoots[0].IsExpanded = false;

        await page.CreateFolderAsync(page.FolderRoots[0]);
        var snapshot = await store.Projects.LoadWorkspaceAsync(project.Id);

        Assert.True(page.FolderRoots[0].IsExpanded);
        Assert.Equal("Tables", Assert.Single(snapshot.Folders.Children(null)).Name);
    }

    [Fact]
    public async Task Renaming_a_folder_keeps_the_selected_folder()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var folder = await store.Folders.CreateAsync(project.Id, null, "Old");
        var dialogs = new FakeDialogService { PromptResult = "New" };
        var page = CreatePage(store, project.Id, dialogs);
        await page.LoadAsync(folder.Id);

        await page.RenameFolderAsync(page.SelectedFolder!);
        var snapshot = await store.Projects.LoadWorkspaceAsync(project.Id);

        Assert.Equal(folder.Id, page.SelectedFolder?.Id);
        Assert.Equal("New", snapshot.Folders.Get(folder.Id).Name);
    }

    [Fact]
    public async Task Deleting_the_selected_folder_selects_its_parent()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Folders.CreateAsync(project.Id, null, "Parent");
        var child = await store.Folders.CreateAsync(project.Id, parent.Id, "Child");
        var dialogs = new FakeDialogService { ConfirmResult = true };
        var page = CreatePage(store, project.Id, dialogs);
        await page.LoadAsync(child.Id);

        await page.DeleteFolderAsync(page.SelectedFolder!);
        var snapshot = await store.Projects.LoadWorkspaceAsync(project.Id);

        Assert.Equal(parent.Id, page.SelectedFolder?.Id);
        Assert.Empty(snapshot.Folders.Children(parent.Id));
    }

    [Fact]
    public async Task Deleting_an_unrelated_folder_keeps_selection()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var selected = await store.Folders.CreateAsync(project.Id, null, "Selected");
        var other = await store.Folders.CreateAsync(project.Id, null, "Other");
        var dialogs = new FakeDialogService { ConfirmResult = true };
        var page = CreatePage(store, project.Id, dialogs);
        await page.LoadAsync(selected.Id);

        await page.DeleteFolderAsync(page.FolderRoots[0].Children.Single(node => node.Id == other.Id));

        Assert.Equal(selected.Id, page.SelectedFolder?.Id);
    }

    [Fact]
    public async Task Reloading_after_project_deletion_returns_home()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var dialogs = new FakeDialogService();
        var navigation = new FakeNavigationService();
        var page = new ProjectWorkspaceViewModel(project.Id, store.Projects, store.Folders, dialogs, navigation);
        await page.LoadAsync();
        await store.Projects.DeleteAsync(project.Id);

        await page.LoadAsync();

        Assert.True(navigation.WentHome);
        Assert.Single(dialogs.Messages);
    }

    [Fact]
    public async Task Moving_a_folder_persists_its_new_parent()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var source = await store.Folders.CreateAsync(project.Id, null, "Source");
        var destination = await store.Folders.CreateAsync(project.Id, null, "Destination");
        var dialogs = new FakeDialogService
        {
            FolderResult = new FolderChoice(destination.Id, destination.Name, 1)
        };
        var page = CreatePage(store, project.Id, dialogs);
        await page.LoadAsync();

        await page.MoveFolderAsync(page.FolderRoots[0].Children.Single(node => node.Id == source.Id));
        var snapshot = await store.Projects.LoadWorkspaceAsync(project.Id);

        Assert.Equal(destination.Id, snapshot.Folders.Get(source.Id).ParentFolderId);
    }

    [Fact]
    public async Task Expansion_survives_folder_rename()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Folders.CreateAsync(project.Id, null, "Parent");
        var child = await store.Folders.CreateAsync(project.Id, parent.Id, "Child");
        var dialogs = new FakeDialogService { PromptResult = "Renamed" };
        var page = CreatePage(store, project.Id, dialogs);
        await page.LoadAsync(child.Id);
        page.FolderRoots[0].Children[0].IsExpanded = false;

        await page.RenameFolderAsync(page.FolderRoots[0].Children[0]);

        Assert.False(page.FolderRoots[0].Children[0].IsExpanded);
        Assert.Equal(child.Id, page.SelectedFolder?.Id);
    }

    private static ProjectWorkspaceViewModel CreatePage(PresentationTestStore store, Guid projectId,
        FakeDialogService dialogs)
    {
        return new ProjectWorkspaceViewModel(projectId, store.Projects, store.Folders,
            dialogs, new FakeNavigationService());
    }

    [Fact]
    public async Task Nested_folders_build_a_tree()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var folder = await store.Folders.CreateAsync(project.Id, null, "dbo");
        await store.Folders.CreateAsync(project.Id, folder.Id, "Tables");
        var page = CreatePage(store, project.Id, new FakeDialogService());

        await page.LoadAsync();

        Assert.Equal("dbo", page.FolderRoots[0].Children[0].Name);
        Assert.Equal("Tables", page.FolderRoots[0].Children[0].Children[0].Name);
    }

    [Fact]
    public async Task Selecting_a_folder_updates_its_breadcrumb_and_area_name()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Folders.CreateAsync(project.Id, null, "dbo");
        await store.Folders.CreateAsync(project.Id, parent.Id, "Tables");
        var page = CreatePage(store, project.Id, new FakeDialogService());
        await page.LoadAsync();

        page.Select(page.FolderRoots[0].Children[0].Children[0]);

        Assert.Equal("Tables", page.SelectedAreaName);
        Assert.Equal(["Home", "Billing", "dbo", "Tables"], page.Breadcrumbs.Select(segment => segment.Name));
    }

    [Fact]
    public async Task Breadcrumb_segment_selects_its_folder()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Folders.CreateAsync(project.Id, null, "dbo");
        var child = await store.Folders.CreateAsync(project.Id, parent.Id, "Tables");
        var page = CreatePage(store, project.Id, new FakeDialogService());
        await page.LoadAsync(child.Id);

        await page.Breadcrumbs[2].NavigateCommand.ExecuteAsync(null);

        Assert.Equal(parent.Id, page.SelectedFolder?.Id);
    }

    [Fact]
    public async Task Home_breadcrumb_navigates_home()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var navigation = new FakeNavigationService();
        var page = new ProjectWorkspaceViewModel(project.Id, store.Projects, store.Folders,
            new FakeDialogService(), navigation);
        await page.LoadAsync();

        await page.Breadcrumbs[0].NavigateCommand.ExecuteAsync(null);

        Assert.True(navigation.WentHome);
    }

    [Fact]
    public async Task Move_cycle_error_is_shown_and_folder_remains_in_place()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Folders.CreateAsync(project.Id, null, "dbo");
        var child = await store.Folders.CreateAsync(project.Id, parent.Id, "Tables");
        var dialogs = new FakeDialogService
        {
            FolderResult = new FolderChoice(child.Id, "Tables", 2)
        };
        var page = new ProjectWorkspaceViewModel(project.Id, store.Projects, store.Folders,
            dialogs, new FakeNavigationService());
        await page.LoadAsync();

        await page.MoveFolderAsync(page.FolderRoots[0].Children[0]);
        var snapshot = await store.Projects.LoadWorkspaceAsync(project.Id);

        Assert.Contains(dialogs.Messages, message => message.Contains("cycle", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(parent.Id, snapshot.Folders.Get(child.Id).ParentFolderId);
    }

    [Fact]
    public async Task Unexpected_workspace_load_failure_is_not_shown_as_a_rule_message()
    {
        var factory = new ThrowingUnitOfWorkFactory();
        var projects = new ProjectService(factory, TimeProvider.System, TimeZoneInfo.Utc);
        var folders = new FolderService(factory, TimeProvider.System);
        var dialogs = new FakeDialogService();
        var page = new ProjectWorkspaceViewModel(Guid.NewGuid(), projects, folders,
            dialogs, new FakeNavigationService());

        await Assert.ThrowsAsync<InvalidOperationException>(() => page.LoadAsync());

        Assert.Empty(dialogs.Messages);
    }

    private sealed class ThrowingUnitOfWorkFactory : IUnitOfWorkFactory
    {
        public IUnitOfWork Begin()
        {
            throw new InvalidOperationException("Storage failed.");
        }
    }

    [Fact]
    public async Task Quick_add_creates_a_top_level_item_in_the_selected_area()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var folder = await store.Folders.CreateAsync(project.Id, null, "dbo");
        using var page = CreateItemPage(store, project.Id);
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
        using var page = CreateItemPage(store, project.Id);

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
        using var page = CreateItemPage(store, project.Id, dialogs);
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
    public async Task Saving_and_reverting_editor_changes_uses_a_fresh_snapshot()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Original");
        using var page = CreateItemPage(store, project.Id);
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
    public async Task Confirmed_delete_removes_the_selected_item_and_its_sub_items()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        await store.Items.CreateAsync(project.Id, null, item.Id, "Child");
        var dialogs = new FakeDialogService { ConfirmResult = true };
        using var page = CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync();
        await page.SelectItemAsync(Assert.Single(page.OpenItems));

        await page.DeleteItemAsync();
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Empty(snapshot.Items);
        Assert.Empty(page.OpenItems);
    }

    private static ProjectWorkspaceViewModel CreateItemPage(PresentationTestStore store,
        Guid projectId, FakeDialogService? dialogs = null, TimeProvider? clock = null)
    {
        return new ProjectWorkspaceViewModel(projectId, store.Projects, store.Folders,
            dialogs ?? new FakeDialogService(), new FakeNavigationService(), store.Items,
            clock, TimeZoneInfo.Utc);
    }

    [Fact]
    public async Task Urgency_rolls_up_from_a_child_and_changes_on_the_clock_tick()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await store.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        await store.Items.EditAsync(child.Id, new ItemEdit(child.Title, null, null, null, null,
            new DateOnly(2026, 11, 14), new TimeOnly(12, 1), null, null));
        using var page = CreateItemPage(store, project.Id, clock: clock);
        await page.LoadAsync();
        var row = Assert.Single(page.OpenItems);

        clock.Advance(TimeSpan.FromMinutes(2));

        Assert.Equal(Urgency.Imminent, row.Urgency);
        Assert.Equal("Child", row.SourceTitle);
    }

    [Fact]
    public async Task Project_threshold_override_changes_row_urgency()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Due later");
        await store.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null,
            new DateOnly(2026, 11, 17), null, null, null));
        await store.Settings.SetProjectOverrideAsync(project.Id,
            SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(5));
        using var page = CreateItemPage(store, project.Id, clock: clock);

        await page.LoadAsync();

        Assert.Equal(Urgency.Approaching, Assert.Single(page.OpenItems).Urgency);
    }

    [Fact]
    public async Task Reordering_selected_items_changes_sibling_order()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        using var page = CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == second.Id));

        await page.ReorderSelectedAsync(-1);
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Equal([second.Id, first.Id], snapshot.Items.Select(node => node.Item.Id));
    }

    [Fact]
    public async Task Home_counts_reflect_open_and_overdue_items_after_workspace_changes()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Late");
        await store.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null,
            new DateOnly(2026, 11, 12), null, null, null));

        var summary = Assert.Single(await store.Projects.ListAsync());

        Assert.Equal(1, summary.OpenCount);
        Assert.Equal(1, summary.OverdueCount);
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
        using var page = CreateItemPage(store, project.Id);

        await page.LoadAsync();

        Assert.True(Assert.Single(page.OpenItems).IsComplete);
        Assert.Empty(page.CompletedItems);
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
        using var page = CreateItemPage(store, project.Id);
        await page.LoadAsync();

        await page.SelectItemAsync(Assert.Single(page.OpenItems));

        Assert.Equal("Legacy", page.Editor!.ArchivedTypeName);
        Assert.Equal("Old rank", page.Editor.ArchivedPriorityName);
        Assert.DoesNotContain(page.ItemTypes, choice => choice.Id == type.Id);
        Assert.DoesNotContain(page.PriorityLevels, choice => choice.Id == priority.Id);
    }

    [Fact]
    public async Task Unsaved_editor_changes_prevent_selection_when_save_is_declined()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var dialogs = new FakeDialogService();
        using var page = CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == first.Id));
        page.Editor!.Title = "Draft";

        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == second.Id));

        Assert.Equal(first.Id, page.Editor.Id);
        Assert.Equal("Draft", page.Editor.Title);
    }

    [Fact]
    public async Task Invalid_editor_title_is_shown_and_not_saved()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Items.CreateAsync(project.Id, null, null, "Original");
        var dialogs = new FakeDialogService();
        using var page = CreateItemPage(store, project.Id, dialogs);
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
    public async Task Reopening_finished_parent_shows_the_core_blocked_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await store.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        await store.Items.SetCompletedAsync(project.Id, null, child.Id, true);
        var dialogs = new FakeDialogService();
        using var page = CreateItemPage(store, project.Id, dialogs);
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
        using var page = CreateItemPage(store, project.Id);
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
        using var page = CreateItemPage(store, project.Id, clock: clock);

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
        using var page = CreateItemPage(store, project.Id);

        await page.LoadAsync();
        var row = Assert.Single(page.OpenItems);

        Assert.Equal("1 completed", row.CompletedLabel);
        Assert.False(row.IsCompletedExpanded);
        Assert.Equal(finished.Id, Assert.Single(row.CompletedChildren).Id);
    }

    [Theory]
    [InlineData(DraftDecision.Save, "Edited", true)]
    [InlineData(DraftDecision.Discard, "Second", true)]
    [InlineData(DraftDecision.Cancel, "Second", false)]
    public async Task Breadcrumb_resolves_a_draft_before_loading_another_area(
        DraftDecision decision, string expectedTitle, bool navigated)
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var firstArea = await store.Folders.CreateAsync(project.Id, null, "First area");
        var secondArea = await store.Folders.CreateAsync(project.Id, firstArea.Id, "Second area");
        await store.Items.CreateAsync(project.Id, firstArea.Id, null, "First");
        var second = await store.Items.CreateAsync(project.Id, secondArea.Id, null, "Second");
        var dialogs = new FakeDialogService { DraftResult = decision };
        using var page = CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync(secondArea.Id);
        await page.SelectItemAsync(Assert.Single(page.OpenItems));
        page.Editor!.Title = "Edited";
        await page.Breadcrumbs[2].NavigateCommand.ExecuteAsync(null);
        var snapshot = await store.Items.LoadAreaAsync(project.Id, secondArea.Id);

        Assert.Equal(second.Id, Assert.Single(snapshot.Items).Item.Id);
        Assert.Equal(expectedTitle, snapshot.Items[0].Item.Title);
        Assert.Equal(navigated, page.SelectedFolder?.Id == firstArea.Id);
    }

    [Fact]
    public async Task Quick_add_is_canceled_when_the_editor_draft_is_kept()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Items.CreateAsync(project.Id, null, null, "Original");
        using var page = CreateItemPage(store, project.Id);
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
        using var page = CreateItemPage(store, project.Id, dialogs);
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
        using var page = CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == first.Id));

        await page.ReorderSelectedAsync(1);
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Equal([last.Id, finished.Id, first.Id], snapshot.Items.Select(node => node.Item.Id));
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
        using var page = CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(Assert.Single(page.OpenItems));

        page.Editor!.SelectedTypeOption = page.TypeOptions[0];
        page.Editor.SelectedPriorityOption = page.PriorityOptions[0];
        await page.SaveAsync();
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Null(snapshot.Items[0].Item.ItemTypeId);
        Assert.Null(snapshot.Items[0].Item.PriorityLevelId);
    }

    [Theory]
    [InlineData("quick add")]
    [InlineData("add sub-item")]
    [InlineData("complete another row")]
    [InlineData("delete item")]
    [InlineData("reorder")]
    [InlineData("create folder")]
    [InlineData("rename folder")]
    [InlineData("move folder")]
    [InlineData("delete folder")]
    [InlineData("area change")]
    [InlineData("home")]
    public async Task Canceling_a_draft_aborts_workspace_actions(string action)
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var folder = await store.Folders.CreateAsync(project.Id, null, "Folder");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var dialogs = new FakeDialogService
        {
            DraftResult = DraftDecision.Cancel,
            ConfirmResult = true,
            PromptResult = "Changed",
            FolderResult = new FolderChoice(null, "Billing", 0)
        };
        var navigation = new FakeNavigationService();
        using var page = new ProjectWorkspaceViewModel(project.Id, store.Projects,
            store.Folders, dialogs, navigation, store.Items);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == first.Id));
        page.Editor!.Title = "Draft";
        page.QuickAddTitle = "New";
        var folderNode = page.FolderRoots[0].Children[0];

        switch (action)
        {
            case "quick add":
                await page.QuickAddAsync();
                break;
            case "add sub-item":
                await page.AddSubItemAsync();
                break;
            case "complete another row":
                await page.ToggleAsync(page.OpenItems.Single(row => row.Id == second.Id));
                break;
            case "delete item":
                await page.DeleteItemAsync();
                break;
            case "reorder":
                await page.ReorderSelectedAsync(1);
                break;
            case "create folder":
                await page.CreateFolderAsync(folderNode);
                break;
            case "rename folder":
                await page.RenameFolderAsync(folderNode);
                break;
            case "move folder":
                await page.MoveFolderAsync(folderNode);
                break;
            case "delete folder":
                await page.DeleteFolderAsync(folderNode);
                break;
            case "area change":
                await page.SelectAreaAsync(folderNode);
                break;
            case "home":
                await page.GoHomeAsync();
                break;
        }

        var area = await store.Items.LoadAreaAsync(project.Id, null);
        var folders = await store.Projects.LoadWorkspaceAsync(project.Id);

        Assert.Equal("Draft", page.Editor!.Title);
        Assert.Equal([first.Id, second.Id], area.Items.Select(node => node.Item.Id));
        Assert.Equal("Folder", Assert.Single(folders.Folders.Children(null)).Name);
        Assert.False(navigation.WentHome);
        Assert.Null(page.SelectedFolder?.Id);
        Assert.Equal(folder.Id, folderNode.Id);
    }
}