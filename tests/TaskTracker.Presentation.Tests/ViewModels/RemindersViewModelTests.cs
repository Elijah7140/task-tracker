using CommunityToolkit.Mvvm.Input;

using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Reminders;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.Tests.Reminders;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Exercises panel commands and the visible count without Avalonia.</summary>
public sealed class RemindersViewModelTests
{
    [Fact]
    public async Task Open_targets_the_item_and_closes_the_panel()
    {
        var opened = Guid.Empty;
        await using var store = new PresentationTestStore();
        var panel = new RemindersViewModel(store.Reminders, new FakeDialogService(),
            item =>
            {
                opened = item;
                return Task.FromResult(SearchOpenOutcome.Opened);
            }, _ => Task.FromResult(false));
        var row = AddEntry(panel);
        panel.IsOpen = true;

        await ((IAsyncRelayCommand)row.OpenCommand).ExecuteAsync(null);

        Assert.Equal(row.Entry.ItemId, opened);
        Assert.False(panel.IsOpen);
    }

    [Fact]
    public async Task Mark_complete_removes_the_entry_only_after_success()
    {
        var completed = false;
        await using var store = new PresentationTestStore();
        var panel = CreatePanel(store, _ => Task.FromResult(completed));
        var row = AddEntry(panel);

        await ((IAsyncRelayCommand)row.CompleteCommand).ExecuteAsync(null);
        Assert.Same(row, Assert.Single(panel.Rows));
        completed = true;
        await ((IAsyncRelayCommand)row.CompleteCommand).ExecuteAsync(null);

        Assert.Empty(panel.Rows);
    }

    [Fact]
    public async Task Dismiss_updates_the_count_and_removes_the_entry()
    {
        await using var store = new PresentationTestStore();
        var panel = CreatePanel(store);
        var row = AddEntry(panel);

        row.DismissCommand.Execute(null);

        Assert.Equal(0, panel.Count);
        Assert.False(panel.HasReminders);
    }

    [Fact]
    public async Task Snooze_removes_the_entry_and_undo_restores_the_original_delivery()
    {
        var clock = new FakeTimeProvider();
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        await ReminderSchedulerTests.SaveAsync(store, "Snoozed task", clock.GetUtcNow().UtcDateTime);
        var entry = Assert.Single(await store.Reminders.DueAsync(TestContext.Current.CancellationToken));
        await store.Reminders.RecordDeliveryAsync([entry], TestContext.Current.CancellationToken);
        var panel = CreatePanel(store);
        panel.Add([entry]);
        var row = Assert.Single(panel.Rows);

        await ((IAsyncRelayCommand)row.SnoozeOneHourCommand).ExecuteAsync(null);

        Assert.Empty(panel.Rows);
        Assert.Empty(await store.Reminders.DueAsync(TestContext.Current.CancellationToken));
        await store.History.UndoAsync(TestContext.Current.CancellationToken);
        await panel.RefreshAsync();
        Assert.Equal(entry, Assert.Single(panel.Rows).Entry);
    }

    private static RemindersViewModel CreatePanel(PresentationTestStore store, Func<Guid, Task<bool>>? complete = null)
    {
        return new RemindersViewModel(store.Reminders, new FakeDialogService(),
            _ => Task.FromResult(SearchOpenOutcome.Cancelled), complete ?? (_ => Task.FromResult(false)));
    }

    private static ReminderRowViewModel AddEntry(RemindersViewModel panel)
    {
        var entry = new ReminderEntry(Guid.NewGuid(), "Reminder", "Project", 0);
        panel.Add([entry]);
        return Assert.Single(panel.Rows);
    }
}