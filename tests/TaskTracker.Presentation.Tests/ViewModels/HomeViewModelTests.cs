#pragma warning disable xUnit1051
using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class HomeViewModelTests
{
    [Fact]
    public async Task Creating_a_project_persists_it()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var dialogs = new FakeDialogService { PromptResult = "Billing" };
        var page = new HomeViewModel(store.Projects, dialogs, new FakeNavigationService());

        await page.CreateAsync();
        var summaries = await store.Projects.ListAsync();

        Assert.Equal("Billing", Assert.Single(summaries).Project.Name);
    }

    [Fact]
    public async Task Cancelling_project_creation_changes_nothing()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = new HomeViewModel(store.Projects, new FakeDialogService(), new FakeNavigationService());

        await page.CreateAsync();

        Assert.Empty(await store.Projects.ListAsync());
    }

    [Fact]
    public async Task Invalid_project_name_shows_a_rule_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var dialogs = new FakeDialogService { PromptResult = "   " };
        var page = new HomeViewModel(store.Projects, dialogs, new FakeNavigationService());

        await page.CreateAsync();

        Assert.Single(dialogs.Messages);
        Assert.Empty(await store.Projects.ListAsync());
    }

    [Fact]
    public async Task Home_loads_project_cards()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Projects.CreateAsync("Billing");
        await store.Projects.CreateAsync("Website");
        var page = new HomeViewModel(store.Projects, new FakeDialogService(), new FakeNavigationService());

        await page.LoadAsync();

        Assert.Equal(2, page.Cards.Count);
        Assert.False(page.IsEmpty);
    }

    [Fact]
    public async Task Home_card_shows_open_and_overdue_item_counts()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Open item");
        await store.Items.EditAsync(item.Id, new ItemEdit("Open item", null, null, null, null,
            new DateOnly(2000, 1, 1), null, null, null));
        var page = new HomeViewModel(store.Projects, new FakeDialogService(), new FakeNavigationService());

        await page.LoadAsync();

        Assert.Equal(1, Assert.Single(page.Cards).OpenCount);
        Assert.Equal(1, Assert.Single(page.Cards).OverdueCount);
    }

    [Fact]
    public async Task Opening_a_project_navigates_to_it()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var navigation = new FakeNavigationService();
        var page = new HomeViewModel(store.Projects, new FakeDialogService(), navigation);
        await page.LoadAsync();

        await page.OpenAsync(Assert.Single(page.Cards));

        Assert.Equal(project.Id, navigation.OpenedProjectId);
    }

    [Fact]
    public async Task Renaming_a_project_persists_its_new_name()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var dialogs = new FakeDialogService { PromptResult = "Accounting" };
        var page = new HomeViewModel(store.Projects, dialogs, new FakeNavigationService());
        await page.LoadAsync();

        await page.RenameAsync(Assert.Single(page.Cards));
        var summary = Assert.Single(await store.Projects.ListAsync());

        Assert.Equal(project.Id, summary.Project.Id);
        Assert.Equal("Accounting", summary.Project.Name);
    }

    [Fact]
    public async Task Cancelling_project_rename_keeps_its_name()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Projects.CreateAsync("Billing");
        var dialogs = new FakeDialogService();
        var page = new HomeViewModel(store.Projects, dialogs, new FakeNavigationService());
        await page.LoadAsync();

        await page.RenameAsync(Assert.Single(page.Cards));

        Assert.Equal("Billing", Assert.Single(await store.Projects.ListAsync()).Project.Name);
    }

    [Fact]
    public async Task Confirming_project_delete_removes_its_card()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Projects.CreateAsync("Billing");
        var dialogs = new FakeDialogService { ConfirmResult = true };
        var page = new HomeViewModel(store.Projects, dialogs, new FakeNavigationService());
        await page.LoadAsync();

        await page.DeleteAsync(Assert.Single(page.Cards));

        Assert.True(page.IsEmpty);
        Assert.Empty(await store.Projects.ListAsync());
    }

    [Fact]
    public async Task Declining_project_delete_keeps_its_card()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Projects.CreateAsync("Billing");
        var page = new HomeViewModel(store.Projects, new FakeDialogService(), new FakeNavigationService());
        await page.LoadAsync();

        await page.DeleteAsync(Assert.Single(page.Cards));

        Assert.Single(await store.Projects.ListAsync());
    }

    [Fact]
    public async Task Opening_a_deleted_project_stays_home_and_shows_a_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var dialogs = new FakeDialogService();
        var shell = new MainWindowViewModel(store.Projects, store.Folders, dialogs);
        await shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);
        await store.Projects.DeleteAsync(project.Id);

        await home.OpenAsync(Assert.Single(home.Cards));

        Assert.IsType<HomeViewModel>(shell.CurrentPage);
        Assert.Single(dialogs.Messages);
    }

    [Fact]
    public async Task Unexpected_load_failure_is_not_swallowed_as_a_rule_message()
    {
        var dialogs = new FakeDialogService();
        var service = new ProjectService(new ThrowingUnitOfWorkFactory(), TimeProvider.System, TimeZoneInfo.Utc);
        var page = new HomeViewModel(service, dialogs, new FakeNavigationService());

        await Assert.ThrowsAsync<InvalidOperationException>(page.LoadAsync);

        Assert.Empty(dialogs.Messages);
    }

    private sealed class ThrowingUnitOfWorkFactory : IUnitOfWorkFactory
    {
        public IUnitOfWork Begin()
        {
            throw new InvalidOperationException("Storage failed.");
        }
    }
}