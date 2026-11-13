#pragma warning disable xUnit1051
using Microsoft.Extensions.Time.Testing;

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