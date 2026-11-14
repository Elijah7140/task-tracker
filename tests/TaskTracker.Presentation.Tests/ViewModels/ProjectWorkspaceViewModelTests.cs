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
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, clock: clock);
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
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, clock: clock);

        await page.LoadAsync();

        Assert.Equal(Urgency.Approaching, Assert.Single(page.OpenItems).Urgency);
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
}