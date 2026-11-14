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

public sealed class ItemEditorCoordinatorTests
{
    [Fact]
    public async Task Unsaved_editor_changes_prevent_selection_when_save_is_declined()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var first = await store.Items.CreateAsync(project.Id, null, null, "First");
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var dialogs = new FakeDialogService();
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == first.Id));
        page.Editor!.Title = "Draft";

        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == second.Id));

        Assert.Equal(first.Id, page.Editor.Id);
        Assert.Equal("Draft", page.Editor.Title);
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