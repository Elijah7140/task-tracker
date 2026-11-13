#pragma warning disable xUnit1051
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class MainWindowViewModelTests
{
    [Fact]
    public async Task Failed_open_disposes_the_candidate_timer()
    {
        var clock = new FakeTimeProvider();
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var dispatcher = new CountingDispatcher();
        var shell = new MainWindowViewModel(store.Projects, store.Folders,
            new FakeDialogService(), store.Items, clock, TimeZoneInfo.Utc, dispatcher);

        await shell.OpenProjectAsync(Guid.NewGuid());
        clock.Advance(TimeSpan.FromMinutes(2));

        Assert.Equal(0, dispatcher.PostCount);
        Assert.IsType<HomeViewModel>(shell.CurrentPage);
    }

    [Fact]
    public async Task Going_home_disposes_the_workspace_timer()
    {
        var clock = new FakeTimeProvider();
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var dispatcher = new CountingDispatcher();
        var shell = new MainWindowViewModel(store.Projects, store.Folders,
            new FakeDialogService(), store.Items, clock, TimeZoneInfo.Utc, dispatcher);
        await shell.OpenProjectAsync(project.Id);

        await shell.GoHomeAsync();
        clock.Advance(TimeSpan.FromMinutes(2));

        Assert.Equal(0, dispatcher.PostCount);
        Assert.IsType<HomeViewModel>(shell.CurrentPage);
    }

    [Fact]
    public async Task Returning_from_settings_reloads_workspace_urgency_thresholds()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Due soon");
        var due = DateOnly.FromDateTime(TimeProvider.System.GetUtcNow().UtcDateTime).AddDays(2);
        await store.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null,
            due, null, null, null));
        var shell = new MainWindowViewModel(store.Projects, store.Folders,
            new FakeDialogService(), store.Items, TimeProvider.System, TimeZoneInfo.Utc,
            settings: store.Settings, lookups: store.Lookups);
        await shell.OpenProjectAsync(project.Id);
        var before = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);

        await shell.OpenAppSettingsAsync(project.Id);
        var settings = Assert.IsType<AppSettingsViewModel>(shell.CurrentPage);
        settings.YellowAmount = 1;
        await settings.SaveAsync();
        await shell.OpenProjectAsync(project.Id);

        var after = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal(TaskTracker.Core.Urgency.Urgency.Approaching, Assert.Single(before.OpenItems).Urgency);
        Assert.Equal(TaskTracker.Core.Urgency.Urgency.None, Assert.Single(after.OpenItems).Urgency);
    }

    private sealed class CountingDispatcher : IUiDispatcher
    {
        public int PostCount { get; private set; }

        public void Post(Action action)
        {
            PostCount++;
            action();
        }
    }
}