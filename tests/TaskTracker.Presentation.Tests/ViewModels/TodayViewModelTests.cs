#pragma warning disable xUnit1051
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Settings;
using TaskTracker.Core.Today;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Tests the completion tree and its live refresh using an injected clock.</summary>
public sealed class TodayViewModelTests
{
    [Fact]
    public async Task Projects_and_areas_keep_the_tree_and_completed_parents_start_collapsed()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var billing = await SeedTreeAsync(store);
        var another = await store.Projects.CreateAsync("Alpha");
        await store.Projects.ReorderAsync([billing, another.Id]);
        var leaf = await store.Items.CreateAsync(another.Id, null, null, "Separate project");
        await store.Items.SetCompletedAsync(another.Id, null, leaf.Id, true);
        using var page = CreatePage(store, clock, TimeZoneInfo.Utc);

        await page.LoadAsync();

        Assert.Equal(["Billing", "Alpha"], page.Projects.Select(project => project.Name));
        var area = Assert.Single(page.Projects[0].Areas);
        Assert.Equal("Billing › dbo", area.Path);
        Assert.Equal(3, page.CompletedCount);
        var context = Assert.Single(area.Rows);
        Assert.True(context.IsExpanded);
        Assert.Equal("Not completed", context.Status);
        var completed = Assert.Single(context.Children);
        Assert.False(completed.IsExpanded);
        Assert.Equal("1 completed", completed.ChildCount);
        Assert.Single(completed.Children);

        completed.IsExpanded = true;
        await page.LoadAsync();

        Assert.True(Assert.Single(Assert.Single(page.Projects[0].Areas[0].Rows).Children).IsExpanded);
    }

    [Fact]
    public async Task A_parent_completed_yesterday_is_collapsed_context_and_reopens_in_place()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        await store.Settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, false);
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await store.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        await store.Items.SetCompletedAsync(project.Id, null, parent.Id, true);
        clock.Advance(TimeSpan.FromDays(1));
        await store.Items.SetCompletedAsync(project.Id, null, child.Id, true);
        using var page = CreatePage(store, clock, TimeZoneInfo.Utc);

        await page.LoadAsync();

        var area = Assert.Single(Assert.Single(page.Projects).Areas);
        var context = Assert.Single(area.Rows);
        Assert.Equal(1, page.CompletedCount);
        Assert.Equal("Completed earlier", context.Status);
        Assert.False(context.IsExpanded);

        await store.Items.SetCompletedAsync(project.Id, null, parent.Id, false);

        var reopened = Assert.Single(Assert.Single(Assert.Single(page.Projects).Areas).Rows);
        Assert.Equal("Not completed", reopened.Status);
        Assert.True(reopened.IsExpanded);
    }

    [Fact]
    public async Task A_save_refreshes_the_page_and_local_midnight_clears_it()
    {
        var zone = TimeZoneInfo.CreateCustomTimeZone("UTC-5 test", TimeSpan.FromHours(-5), "UTC-5", "UTC-5");
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 14, 4, 59, 0, TimeSpan.Zero));
        await using var store = new PresentationTestStore(clock, zone);
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Last task");
        using var page = CreatePage(store, clock, zone);
        await page.LoadAsync();

        await store.Items.SetCompletedAsync(project.Id, null, item.Id, true);
        Assert.Equal(1, page.CompletedCount);

        clock.Advance(TimeSpan.FromMinutes(1));

        Assert.True(page.IsEmpty);
        Assert.Empty(page.Projects);
    }

    [Fact]
    public async Task A_periodic_check_notices_a_wall_clock_jump_past_midnight()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 10, 0, 0, TimeSpan.Zero));
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Last task");
        await store.Items.SetCompletedAsync(project.Id, null, item.Id, true);
        using var page = CreatePage(store, clock, TimeZoneInfo.Utc);
        await page.LoadAsync();
        Assert.Equal(1, page.CompletedCount);

        clock.AdjustTime(new DateTimeOffset(2026, 11, 14, 1, 0, 0, TimeSpan.Zero));
        clock.Advance(TimeSpan.FromMinutes(1));

        Assert.True(page.IsEmpty);
        Assert.Empty(page.Projects);
    }

    private static TodayViewModel CreatePage(PresentationTestStore store, TimeProvider clock, TimeZoneInfo zone)
    {
        var service = new TodayService(store.UnitOfWorkFactory, clock, zone);
        return new TodayViewModel(service, store.Items, store.Saves, clock, new ImmediateDispatcher(),
            new FakeNavigationService());
    }

    private static async Task<Guid> SeedTreeAsync(PresentationTestStore store)
    {
        var project = await store.Projects.CreateAsync("Billing");
        var area = await store.Folders.CreateAsync(project.Id, null, "dbo");
        var items = store.Items;
        var context = await items.CreateAsync(project.Id, area.Id, null, "Context");
        var parent = await items.CreateAsync(project.Id, area.Id, context.Id, "Completed parent");
        var child = await items.CreateAsync(project.Id, area.Id, parent.Id, "Completed child");
        await items.CreateAsync(project.Id, area.Id, context.Id, "Still open");
        await items.SetCompletedAsync(project.Id, area.Id, child.Id, true);
        return project.Id;
    }
}