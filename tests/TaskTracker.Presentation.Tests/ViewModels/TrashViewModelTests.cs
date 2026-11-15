using System.Globalization;

using TaskTracker.Core;
using TaskTracker.Core.Trash;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Trash listing, scope, restore, permanent deletion, errors and load ordering.</summary>
public sealed class TrashViewModelTests
{
    private static readonly CultureInfo English = CultureInfo.GetCultureInfo("en-US");

    [Fact]
    public async Task Load_lists_the_batches_in_the_order_the_service_gives_them()
    {
        var trash = new FakeTrashService();
        trash.Batches.AddRange([TrashBatches.Item("Newest"), TrashBatches.Folder("Older")]);
        using var page = CreatePage(trash);

        await page.LoadAsync();

        Assert.Equal(["Newest", "Older"], page.Batches.Select(row => row.Title));
        Assert.False(page.ShowEmpty);
    }

    [Fact]
    public async Task An_empty_trash_shows_the_empty_state_only_after_loading()
    {
        var trash = new FakeTrashService();
        using var page = CreatePage(trash);
        Assert.False(page.ShowEmpty);

        await page.LoadAsync();

        Assert.True(page.ShowEmpty);
        Assert.False(page.EmptyCommand.CanExecute(null));
    }

    [Fact]
    public void Opened_from_home_the_only_scope_is_all_projects()
    {
        using var page = CreatePage(new FakeTrashService());

        Assert.Equal([TrashViewModel.AllProjectsScope], page.ScopeOptions);
        Assert.Equal(TrashViewModel.AllProjectsScope, page.SelectedScope);
    }

    [Fact]
    public async Task Opened_from_a_project_starts_in_that_project_and_can_widen_to_all_projects()
    {
        var trash = new FakeTrashService();
        trash.Batches.AddRange([TrashBatches.Item("Mine"), TrashBatches.Item("Theirs", TrashBatches.SecondProject)]);
        using var page = CreatePage(trash, TrashBatches.FirstProject);

        await page.LoadAsync();
        Assert.Equal(["Mine"], page.Batches.Select(row => row.Title));
        Assert.Equal(TrashViewModel.ThisProjectScope, page.SelectedScope);

        page.SelectedScope = TrashViewModel.AllProjectsScope;
        await WaitForListsAsync(trash, 2);

        Assert.Equal(["Mine", "Theirs"], page.Batches.Select(row => row.Title));
        Assert.Equal(TrashScope.AllProjects, trash.ListedScopes[^1]);
        Assert.Equal(TrashScope.ForProject(TrashBatches.FirstProject), trash.ListedScopes[0]);
    }

    [Fact]
    public async Task Restore_restores_the_batch_removes_the_row_and_marks_the_page_for_refresh()
    {
        var trash = new FakeTrashService();
        var item = TrashBatches.Item("Item");
        trash.Batches.AddRange([item, TrashBatches.Item("Other")]);
        using var page = CreatePage(trash);
        await page.LoadAsync();

        await page.RestoreAsync(page.Batches[0]);

        Assert.Equal([item.BatchId], trash.Restored);
        Assert.Equal(["Other"], page.Batches.Select(row => row.Title));
        Assert.True(page.MayHaveRestored);
        Assert.Null(page.Error);
    }

    [Fact]
    public async Task Restore_does_nothing_for_a_blocked_batch()
    {
        var trash = new FakeTrashService();
        trash.Batches.Add(TrashBatches.Item("Blocked", blockedReason: "Restore the project first"));
        using var page = CreatePage(trash);
        await page.LoadAsync();

        await page.RestoreAsync(page.Batches[0]);

        Assert.Empty(trash.Restored);
        Assert.False(page.MayHaveRestored);
        Assert.Equal("Restore the project first", page.Batches[0].RestoreBlockedReason);
    }

    [Fact]
    public async Task A_rule_failure_while_restoring_is_shown_inline_and_the_list_reloads()
    {
        var trash = new FakeTrashService();
        trash.Batches.Add(TrashBatches.Item("Item"));
        using var page = CreatePage(trash);
        await page.LoadAsync();
        trash.NextFailure = new DomainRuleException("That deletion no longer exists.");
        trash.Batches.Clear();

        await page.RestoreAsync(page.Batches[0]);

        Assert.Equal("That deletion no longer exists.", page.Error);
        Assert.True(page.HasError);
        Assert.Empty(page.Batches);
        Assert.True(page.MayHaveRestored);
    }

    [Fact]
    public async Task An_unexpected_failure_is_shown_inline_instead_of_crashing()
    {
        var trash = new FakeTrashService();
        trash.Batches.Add(TrashBatches.Item("Item"));
        using var page = CreatePage(trash);
        await page.LoadAsync();
        trash.NextFailure = new InvalidOperationException("Disk full");

        await page.RestoreAsync(page.Batches[0]);

        Assert.Equal("Something went wrong: Disk full", page.Error);
    }

    [Fact]
    public async Task The_next_successful_operation_clears_the_error()
    {
        var trash = new FakeTrashService();
        trash.Batches.AddRange([TrashBatches.Item("First"), TrashBatches.Item("Second")]);
        using var page = CreatePage(trash);
        await page.LoadAsync();
        trash.NextFailure = new DomainRuleException("Nope");
        await page.RestoreAsync(page.Batches[0]);
        Assert.NotNull(page.Error);

        await page.RestoreAsync(page.Batches[0]);

        Assert.Null(page.Error);
    }

    [Fact]
    public async Task Cancelling_the_confirmation_keeps_the_batch()
    {
        var trash = new FakeTrashService();
        var dialogs = new FakeDialogService { ConfirmResult = false };
        trash.Batches.Add(TrashBatches.Item("Item"));
        using var page = CreatePage(trash, dialogs: dialogs);
        await page.LoadAsync();

        await page.PurgeAsync(page.Batches[0]);

        Assert.Empty(trash.Purged);
        Assert.Single(page.Batches);
        Assert.Equal(["Delete permanently"], dialogs.ConfirmTitles);
    }

    [Fact]
    public async Task Confirming_permanently_deletes_the_batch()
    {
        var trash = new FakeTrashService();
        var dialogs = new FakeDialogService { ConfirmResult = true };
        var item = TrashBatches.Item("Item");
        trash.Batches.Add(item);
        using var page = CreatePage(trash, dialogs: dialogs);
        await page.LoadAsync();

        await page.PurgeAsync(page.Batches[0]);

        Assert.Equal([item.BatchId], trash.Purged);
        Assert.Empty(page.Batches);
        Assert.True(page.ShowEmpty);
        Assert.False(page.MayHaveRestored);
    }

    [Fact]
    public async Task A_refused_permanent_deletion_is_shown_inline()
    {
        var trash = new FakeTrashService();
        var dialogs = new FakeDialogService { ConfirmResult = true };
        trash.Batches.Add(TrashBatches.Item("Parent"));
        using var page = CreatePage(trash, dialogs: dialogs);
        await page.LoadAsync();
        trash.NextFailure = new DomainRuleException("'Child' still belongs to 'Parent'. Delete 'Child' permanently first.");

        await page.PurgeAsync(page.Batches[0]);

        Assert.Contains("'Child'", page.Error);
        Assert.Single(page.Batches);
    }

    [Fact]
    public async Task Emptying_asks_first_and_cancelling_changes_nothing()
    {
        var trash = new FakeTrashService();
        var dialogs = new FakeDialogService { ConfirmResult = false };
        trash.Batches.AddRange([TrashBatches.Item("One"), TrashBatches.Item("Two")]);
        using var page = CreatePage(trash, dialogs: dialogs);
        await page.LoadAsync();

        await page.EmptyAsync();

        Assert.Empty(trash.Emptied);
        Assert.Equal(2, page.Batches.Count);
        Assert.Equal(["Empty trash"], dialogs.ConfirmTitles);
    }

    [Fact]
    public async Task Confirming_empties_the_scope_that_is_showing()
    {
        var trash = new FakeTrashService();
        var dialogs = new FakeDialogService { ConfirmResult = true };
        trash.Batches.AddRange([TrashBatches.Item("Mine"), TrashBatches.Item("Theirs", TrashBatches.SecondProject)]);
        using var page = CreatePage(trash, TrashBatches.FirstProject, dialogs);
        await page.LoadAsync();

        await page.EmptyAsync();

        Assert.Equal([TrashScope.ForProject(TrashBatches.FirstProject)], trash.Emptied);
        Assert.Empty(page.Batches);
        Assert.Equal("Theirs", Assert.Single(trash.Batches).Title);
    }

    [Fact]
    public async Task Newer_load_replaces_stale_results_and_cancels_the_older_load()
    {
        var trash = new FakeTrashService { HoldLists = true };
        trash.Batches.Add(TrashBatches.Item("Old"));
        using var page = CreatePage(trash, TrashBatches.FirstProject);
        var first = page.LoadAsync();
        page.SelectedScope = TrashViewModel.AllProjectsScope;
        Assert.True(trash.ListTokens[0].IsCancellationRequested);

        trash.CompleteList(1, [TrashBatches.Item("New")]);
        await WaitUntilAsync(() => page.Batches.Count > 0);
        trash.CompleteList(0, [TrashBatches.Item("Stale")]);
        await first;

        Assert.Equal(["New"], page.Batches.Select(row => row.Title));
    }

    [Fact]
    public async Task Disposing_the_page_cancels_the_load_and_ignores_its_late_result()
    {
        var trash = new FakeTrashService { HoldLists = true };
        var page = CreatePage(trash);
        var load = page.LoadAsync();

        page.Dispose();
        trash.CompleteList(0, [TrashBatches.Item("Late")]);
        await load;

        Assert.True(trash.ListTokens[0].IsCancellationRequested);
        Assert.Empty(page.Batches);
        Assert.False(page.ShowEmpty);
    }

    [Fact]
    public async Task A_load_failure_is_shown_inline()
    {
        var trash = new FakeTrashService { HoldLists = true };
        using var page = CreatePage(trash);
        var load = page.LoadAsync();
        trash.FailList(0, new InvalidOperationException("Storage unavailable"));

        await load;

        Assert.Equal("Something went wrong: Storage unavailable", page.Error);
    }

    [Fact]
    public async Task A_disposed_page_does_not_load_or_change_anything()
    {
        var trash = new FakeTrashService();
        trash.Batches.Add(TrashBatches.Item("Item"));
        var dialogs = new FakeDialogService { ConfirmResult = true };
        var page = CreatePage(trash, dialogs: dialogs);
        page.Dispose();

        await page.LoadAsync();
        await page.PurgeAsync(TrashRowFor(trash));

        Assert.Empty(trash.ListedScopes);
        Assert.Empty(trash.Purged);
    }

    [Fact]
    public async Task A_second_restore_while_one_is_running_is_ignored()
    {
        var trash = new FakeTrashService { RestoreGate = new TaskCompletionSource() };
        trash.Batches.AddRange([TrashBatches.Item("First"), TrashBatches.Item("Second")]);
        using var page = CreatePage(trash);
        await page.LoadAsync();
        var row = page.Batches[0];

        var first = page.RestoreAsync(row);
        await page.RestoreAsync(row);
        await page.RestoreAsync(page.Batches[1]);

        Assert.Single(trash.Restored);
        Assert.True(page.IsWorking);
        trash.RestoreGate.SetResult();
        await first;
        Assert.False(page.IsWorking);
    }

    [Fact]
    public async Task A_second_purge_while_the_confirmation_is_open_is_ignored()
    {
        var trash = new FakeTrashService();
        var dialogs = new GatedConfirmDialogService();
        trash.Batches.Add(TrashBatches.Item("Item"));
        using var page = CreatePage(trash, dialogs: dialogs);
        await page.LoadAsync();

        var first = page.PurgeAsync(page.Batches[0]);
        await page.PurgeAsync(page.Batches[0]);

        Assert.Equal(1, dialogs.ConfirmCount);
        dialogs.Answer.SetResult(false);
        await first;
        Assert.False(page.IsWorking);
    }

    [Fact]
    public async Task Irreversible_confirmations_make_Cancel_the_default_button()
    {
        var trash = new FakeTrashService();
        var dialogs = new FakeDialogService { ConfirmResult = false };
        trash.Batches.Add(TrashBatches.Item("Item"));
        using var page = CreatePage(trash, dialogs: dialogs);
        await page.LoadAsync();

        await page.PurgeAsync(page.Batches[0]);
        await page.EmptyAsync();

        Assert.Equal([true, true], dialogs.CancelDefaults);
    }

    [Fact]
    public async Task Purging_a_project_says_it_also_deletes_the_entries_deleted_from_it_earlier()
    {
        var trash = new FakeTrashService();
        var dialogs = new FakeDialogService { ConfirmResult = false };
        var project = TrashBatches.Project("Old project");
        trash.Batches.AddRange([project, TrashBatches.Item("Earlier item", project.ProjectId),
            TrashBatches.Folder("Earlier folder", project.ProjectId), TrashBatches.Item("Other project's item")]);
        using var page = CreatePage(trash, dialogs: dialogs);
        await page.LoadAsync();

        await page.PurgeAsync(page.Batches.Single(row => row.Title == "Old project"));
        await page.PurgeAsync(page.Batches.Single(row => row.Title == "Other project's item"));

        Assert.Contains("also deletes the 2 entries", dialogs.ConfirmMessages[0]);
        Assert.DoesNotContain("also deletes", dialogs.ConfirmMessages[1]);
    }

    [Fact]
    public async Task Back_goes_through_navigation()
    {
        var navigation = new FakeNavigationService();
        using var page = CreatePage(new FakeTrashService(), navigation: navigation);

        page.BackCommand.Execute(null);
        await Task.Yield();

        Assert.True(navigation.ReturnedFromTrash);
    }

    private static TrashViewModel CreatePage(FakeTrashService trash, Guid? projectId = null,
        TaskTracker.Presentation.Navigation.IDialogService? dialogs = null, FakeNavigationService? navigation = null)
    {
        return new TrashViewModel(trash, dialogs ?? new FakeDialogService(), navigation ?? new FakeNavigationService(),
            TimeZoneInfo.Utc, projectId, English);
    }

    private static TrashBatchViewModel TrashRowFor(FakeTrashService trash)
    {
        return new TrashBatchViewModel(trash.Batches[0], TimeZoneInfo.Utc, English);
    }

    /// <summary>Waits for the list calls a fire-and-forget scope change started.</summary>
    private static async Task WaitForListsAsync(FakeTrashService trash, int count)
    {
        await WaitUntilAsync(() => trash.ListedScopes.Count >= count);
        await Task.Yield();
    }

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        for (var attempt = 0; attempt < 500 && !condition(); attempt++)
        {
            await Task.Delay(2);
        }

        Assert.True(condition(), "The expected change never happened.");
    }
}