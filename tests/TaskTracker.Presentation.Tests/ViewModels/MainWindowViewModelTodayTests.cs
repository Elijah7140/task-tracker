#pragma warning disable xUnit1051
using CommunityToolkit.Mvvm.Input;

using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Exercises returning from Today while a reopen is waiting to commit.</summary>
public sealed class MainWindowViewModelTodayTests
{
    [Fact]
    public async Task A_commit_while_search_is_visible_refreshes_its_return_workspace()
    {
        var clock = new FakeTimeProvider();
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var shell = SearchTestShell.Create(store, clock: clock);
        await shell.OpenProjectAsync(project.Id);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await shell.OpenSearchAsync();

        var added = await store.Items.CreateAsync(project.Id, null, null, "Added while in Search");
        await shell.ReturnFromSearchAsync();

        Assert.Same(workspace, shell.CurrentPage);
        Assert.Equal(added.Id, Assert.Single(workspace.OpenItems).Id);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Back_shows_the_reopened_item_even_if_the_write_is_still_pending(bool switchToSearch)
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 10, 0, 0, TimeSpan.Zero));
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Completed task");
        await store.Items.SetCompletedAsync(project.Id, null, item.Id, true);
        var shell = SearchTestShell.Create(store, clock: clock);
        await shell.OpenProjectAsync(project.Id);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Single(workspace.CompletedItems);
        await shell.OpenTodayAsync();
        var today = Assert.IsType<TodayViewModel>(shell.CurrentPage);
        var row = Assert.Single(Assert.Single(Assert.Single(today.Projects).Areas).Rows);

        Task reopen;
        Task back;
        using (await store.WriteGate.EnterAsync())
        {
            reopen = ((IAsyncRelayCommand)row.ReopenCommand).ExecuteAsync(null);
            Assert.False(reopen.IsCompleted);
            if (switchToSearch)
            {
                await shell.OpenSearchAsync();
            }

            back = switchToSearch ? shell.ReturnFromSearchAsync() : shell.ReturnFromTodayAsync();
        }

        await reopen;
        await back;

        Assert.Same(workspace, shell.CurrentPage);
        Assert.Equal(item.Id, Assert.Single(workspace.OpenItems).Id);
        Assert.Empty(workspace.CompletedItems);
    }

    [Fact]
    public async Task Back_shows_the_new_date_when_push_back_is_still_pending()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 10, 0, 0, TimeSpan.Zero));
        var due = new DateOnly(2026, 11, 13);
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Project");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Dated task");
        await store.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null, due, null, null, null));
        var shell = SearchTestShell.Create(store, clock: clock);
        await shell.OpenProjectAsync(project.Id);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await shell.OpenCalendarAsync();

        Task pushBack;
        Task back;
        using (await store.WriteGate.EnterAsync())
        {
            pushBack = shell.PushBackAsync(item.Id);
            back = shell.ReturnFromCalendarAsync();
        }

        await pushBack;
        await back;

        Assert.Same(workspace, shell.CurrentPage);
        Assert.Equal(due.AddDays(1), Assert.Single(workspace.OpenItems).Node.Item.DueDate);
    }
}