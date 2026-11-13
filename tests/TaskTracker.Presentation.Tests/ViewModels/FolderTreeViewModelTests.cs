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

public sealed class FolderTreeViewModelTests
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
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync(secondArea.Id);
        await page.SelectItemAsync(Assert.Single(page.OpenItems));
        page.Editor!.Title = "Edited";
        await page.Breadcrumbs[2].NavigateCommand.ExecuteAsync(null);
        var snapshot = await store.Items.LoadAreaAsync(project.Id, secondArea.Id);

        Assert.Equal(second.Id, Assert.Single(snapshot.Items).Item.Id);
        Assert.Equal(expectedTitle, snapshot.Items[0].Item.Title);
        Assert.Equal(navigated, page.SelectedFolder?.Id == firstArea.Id);
    }
}