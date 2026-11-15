#pragma warning disable xUnit1051
using TaskTracker.Core.Items;
using TaskTracker.Presentation.Markdown;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class ItemEditorMarkdownTests
{
    [Fact]
    public async Task The_editor_starts_in_edit_mode_and_the_preview_toggles()
    {
        await using var world = await World.CreateAsync();
        var editor = world.Page.Editor!;
        Assert.True(editor.IsEditingDescription);
        Assert.False(editor.IsPreviewing);
        Assert.Empty(editor.PreviewBlocks);
        editor.Description = "# Hello";

        editor.ShowPreviewCommand.Execute(null);

        Assert.True(editor.IsPreviewing);
        Assert.False(editor.IsEditingDescription);
        Assert.IsType<MarkdownHeading>(Assert.Single(editor.PreviewBlocks));

        editor.ShowEditCommand.Execute(null);

        Assert.True(editor.IsEditingDescription);
    }

    [Fact]
    public async Task Previewing_does_not_make_the_editor_dirty()
    {
        await using var world = await World.CreateAsync();
        world.Page.Editor!.ShowPreviewCommand.Execute(null);

        Assert.False(world.Page.HasUnsavedChanges);
    }

    [Fact]
    public async Task Stored_links_load_into_the_editor_in_order()
    {
        await using var world = await World.CreateAsync(("https://a.example", "Aye"), ("https://b.example", null));

        var rows = world.Page.Editor!.Links.Items;

        Assert.Equal(["https://a.example", "https://b.example"], rows.Select(row => row.Url));
        Assert.False(world.Page.HasUnsavedChanges);
    }

    [Fact]
    public async Task Adding_a_link_makes_the_editor_dirty_and_save_stores_it()
    {
        await using var world = await World.CreateAsync();
        var links = world.Page.Editor!.Links;
        links.NewUrl = "https://example.com";
        links.NewTitle = "Example";
        links.SubmitCommand.Execute(null);
        Assert.True(world.Page.HasUnsavedChanges);

        Assert.True(await world.Page.SaveAsync());

        var stored = await world.Store.Items.LoadLinksAsync(world.ItemId);
        var link = Assert.Single(stored);
        Assert.Equal(("https://example.com", "Example"), (link.Url, link.Title));
        Assert.False(world.Page.HasUnsavedChanges);
    }

    [Fact]
    public async Task Save_adds_text_left_in_the_add_box()
    {
        await using var world = await World.CreateAsync();
        world.Page.Editor!.Links.NewUrl = "https://left.example";

        Assert.True(await world.Page.SaveAsync());

        Assert.Equal(["https://left.example"], (await world.Store.Items.LoadLinksAsync(world.ItemId)).Select(link => link.Url));
    }

    [Fact]
    public async Task Save_is_refused_with_a_message_when_the_add_box_holds_a_bad_link()
    {
        await using var world = await World.CreateAsync();
        world.Page.Editor!.Links.NewUrl = "file:///C:/x";

        Assert.False(await world.Page.SaveAsync());

        Assert.Equal(["Fix the link marked in red first."], world.Dialogs.Messages);
        Assert.Empty(await world.Store.Items.LoadLinksAsync(world.ItemId));
    }

    [Fact]
    public async Task Revert_restores_the_stored_links()
    {
        await using var world = await World.CreateAsync(("https://a.example", null));
        var links = world.Page.Editor!.Links;
        links.Items[0].RemoveCommand.Execute(null);
        links.NewUrl = "https://extra.example";
        links.SubmitCommand.Execute(null);

        world.Page.Revert();

        Assert.Equal(["https://a.example"], world.Page.Editor!.Links.Items.Select(row => row.Url));
        Assert.False(world.Page.HasUnsavedChanges);
    }

    [Fact]
    public async Task Removing_and_reordering_links_save_the_new_list()
    {
        await using var world = await World.CreateAsync(("https://a.example", null), ("https://b.example", null),
            ("https://c.example", null));
        var links = world.Page.Editor!.Links;
        links.Items[0].RemoveCommand.Execute(null);
        links.Items[0].MoveDownCommand.Execute(null);

        await world.Page.SaveAsync();

        var stored = await world.Store.Items.LoadLinksAsync(world.ItemId);
        Assert.Equal(["https://c.example", "https://b.example"], stored.Select(link => link.Url));
        Assert.Equal([0, 1], stored.Select(link => link.SortOrder));
    }

    [Fact]
    public async Task Opening_a_link_goes_through_the_launcher()
    {
        await using var world = await World.CreateAsync();

        await world.Page.OpenLinkAsync("https://example.com/x");

        Assert.Equal([new Uri("https://example.com/x")], world.Launcher.Launched);
    }

    [Theory]
    [InlineData("file:///C:/secrets.txt")]
    [InlineData("javascript:alert(1)")]
    [InlineData("ftp://example.com")]
    [InlineData("not a link")]
    [InlineData("")]
    [InlineData(null)]
    public async Task Blocked_or_invalid_addresses_never_reach_the_launcher(string? url)
    {
        await using var world = await World.CreateAsync();

        await world.Page.OpenLinkAsync(url);

        Assert.Empty(world.Launcher.Launched);
    }

    [Fact]
    public async Task A_failed_launch_shows_a_message()
    {
        await using var world = await World.CreateAsync();
        world.Launcher.Result = false;

        await world.Page.OpenLinkAsync("https://example.com");

        Assert.Equal(["The link could not be opened: https://example.com"], world.Dialogs.Messages);
    }

    [Fact]
    public async Task The_open_link_command_passes_its_parameter_to_the_launcher()
    {
        await using var world = await World.CreateAsync();

        world.Page.OpenLinkCommand.Execute("mailto:a@example.com");
        await Task.Yield();

        Assert.Equal([new Uri("mailto:a@example.com")], world.Launcher.Launched);
    }

    [Fact]
    public async Task Leaving_with_changed_links_asks_the_unsaved_changes_question()
    {
        await using var world = await World.CreateAsync();
        world.Dialogs.DraftResult = DraftDecision.Cancel;
        world.Page.Editor!.Links.NewUrl = "https://x.example";
        world.Page.Editor.Links.SubmitCommand.Execute(null);

        var allowed = await world.Page.ConfirmLeaveAsync();

        Assert.False(allowed);
        Assert.Equal(1, world.Dialogs.DraftPromptCount);
    }

    private sealed class World : IAsyncDisposable
    {
        private World(PresentationTestStore store, ProjectWorkspaceViewModel page, FakeDialogService dialogs,
            FakeLinkLauncher launcher, Guid itemId)
        {
            Store = store;
            Page = page;
            Dialogs = dialogs;
            Launcher = launcher;
            ItemId = itemId;
        }

        public PresentationTestStore Store { get; }

        public ProjectWorkspaceViewModel Page { get; }

        public FakeDialogService Dialogs { get; }

        public FakeLinkLauncher Launcher { get; }

        public Guid ItemId { get; }

        public static async Task<World> CreateAsync(params (string Url, string? Title)[] links)
        {
            var store = new PresentationTestStore();
            await store.InitializeAsync();
            var project = await store.Projects.CreateAsync("Billing");
            var item = await store.Items.CreateAsync(project.Id, null, null, "Task");
            await SeedLinksAsync(store, item, links);
            var dialogs = new FakeDialogService();
            var launcher = new FakeLinkLauncher();
            var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, dialogs, linkLauncher: launcher);
            await page.LoadAsync();
            await page.SelectItemAsync(Assert.Single(page.OpenItems));

            return new World(store, page, dialogs, launcher, item.Id);
        }

        public async ValueTask DisposeAsync()
        {
            Page.Dispose();
            await Store.DisposeAsync();
        }

        private static async Task SeedLinksAsync(PresentationTestStore store, TodoItem item,
            (string Url, string? Title)[] links)
        {
            var inputs = links.Select(link => new ItemLinkInput(null, link.Url, link.Title)).ToList();
            var edit = new ItemEdit(item.Title, null, null, null, null, null, null, null, null);
            await store.Items.EditAsync(item.Id, edit, [], inputs);
        }
    }
}