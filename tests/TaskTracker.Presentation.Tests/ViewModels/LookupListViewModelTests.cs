#pragma warning disable xUnit1051
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class LookupListViewModelTests
{
    [Fact]
    public async Task Adding_a_type_saves_it_and_clears_the_name_box()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = await LoadItemTypesAsync(store, new FakeDialogService());

        page.NewName = "Review";
        await page.AddCommand.ExecuteAsync(null);

        Assert.Equal("Review", page.Active.Last().Name);
        Assert.Equal(string.Empty, page.NewName);
        Assert.Contains(await store.Lookups.ItemTypesAsync(), row => row.Name == "Review");
    }

    [Fact]
    public async Task Renaming_a_type_uses_the_prompted_name()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var dialogs = new FakeDialogService { PromptResult = "Approval" };
        var page = await LoadItemTypesAsync(store, dialogs);
        page.NewName = "Review";
        await page.AddCommand.ExecuteAsync(null);
        var row = page.Active.Single(candidate => candidate.Name == "Review");

        await page.RenameCommand.ExecuteAsync(row);

        Assert.Contains(page.Active, candidate => candidate.Name == "Approval");
        Assert.DoesNotContain(page.Active, candidate => candidate.Name == "Review");
    }

    [Fact]
    public async Task Cancelling_the_rename_prompt_changes_nothing()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = await LoadItemTypesAsync(store, new FakeDialogService { PromptResult = null });
        var row = page.Active.Last();

        await page.RenameCommand.ExecuteAsync(row);

        Assert.Equal(row.Name, page.Active.Last().Name);
    }

    [Fact]
    public async Task Moving_a_priority_level_up_changes_its_rank()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = await LoadPriorityLevelsAsync(store);
        var high = page.Active.Single(row => row.Name == "High");

        await page.MoveUpCommand.ExecuteAsync(high);

        var persisted = (await store.Lookups.PriorityLevelsAsync()).OrderBy(row => row.SortOrder).First();
        Assert.Equal("High", page.Active.First().Name);
        Assert.Equal("High", persisted.Name);
    }

    [Fact]
    public async Task Moving_a_priority_level_down_changes_its_rank()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = await LoadPriorityLevelsAsync(store);
        var first = page.Active.First();

        await page.MoveDownCommand.ExecuteAsync(first);

        var persisted = (await store.Lookups.PriorityLevelsAsync()).OrderBy(row => row.SortOrder).ToList();
        Assert.Equal(first.Name, page.Active[1].Name);
        Assert.Equal(first.Name, persisted[1].Name);
    }

    [Fact]
    public async Task First_row_cannot_move_up_and_last_row_cannot_move_down()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = await LoadPriorityLevelsAsync(store);

        Assert.False(page.MoveUpCommand.CanExecute(page.Active.First()));
        Assert.True(page.MoveDownCommand.CanExecute(page.Active.First()));
        Assert.False(page.MoveDownCommand.CanExecute(page.Active.Last()));
        Assert.True(page.MoveUpCommand.CanExecute(page.Active.Last()));
    }

    [Fact]
    public async Task Archiving_and_restoring_a_custom_type_moves_it_between_sections()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = await LoadItemTypesAsync(store, new FakeDialogService());
        page.NewName = "Review";
        await page.AddCommand.ExecuteAsync(null);

        await page.ArchiveCommand.ExecuteAsync(page.Active.Single(row => row.Name == "Review"));

        Assert.True(page.HasArchived);
        Assert.Equal("Review", Assert.Single(page.Archived).Name);

        await page.UnarchiveCommand.ExecuteAsync(page.Archived.Single());

        Assert.False(page.HasArchived);
        Assert.Contains(page.Active, row => row.Name == "Review");
    }

    [Fact]
    public async Task Built_in_type_archive_is_disabled_and_the_service_rejection_is_shown()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var dialogs = new FakeDialogService();
        var page = await LoadItemTypesAsync(store, dialogs);
        var builtIn = page.Active.First(row => row.IsBuiltIn);

        var canArchive = page.ArchiveCommand.CanExecute(builtIn);
        await page.ArchiveCommand.ExecuteAsync(builtIn);

        Assert.False(canArchive);
        Assert.Equal("Built-in types can't be archived", builtIn.ArchiveTooltip);
        Assert.Equal("Built-in item types cannot be archived.", Assert.Single(dialogs.Messages));
        Assert.Empty(page.Archived);
    }

    [Fact]
    public async Task Duplicate_name_is_rejected_with_a_message_and_keeps_the_typed_name()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var dialogs = new FakeDialogService();
        var page = await LoadItemTypesAsync(store, dialogs);
        var countBefore = page.Active.Count;

        page.NewName = "change";
        await page.AddCommand.ExecuteAsync(null);

        Assert.Equal("The name 'change' is already used by another item type.", Assert.Single(dialogs.Messages));
        Assert.Equal(countBefore, page.Active.Count);
        Assert.Equal("change", page.NewName);
    }

    private static async Task<LookupListViewModel> LoadItemTypesAsync(PresentationTestStore store, FakeDialogService dialogs)
    {
        var page = new LookupListViewModel(store.Lookups, dialogs, true);
        await page.LoadAsync();

        return page;
    }

    private static async Task<LookupListViewModel> LoadPriorityLevelsAsync(PresentationTestStore store)
    {
        var page = new LookupListViewModel(store.Lookups, new FakeDialogService(), false);
        await page.LoadAsync();

        return page;
    }
}