#pragma warning disable xUnit1051
using TaskTracker.Core.Undo;

namespace TaskTracker.Core.Tests.Undo;

public sealed class UndoHistoryTests
{
    [Fact]
    public void An_empty_history_can_neither_undo_nor_redo()
    {
        var history = new UndoHistory();

        Assert.False(history.CanUndo);
        Assert.False(history.CanRedo);
        Assert.Null(history.UndoDescription);
        Assert.Null(history.RedoDescription);
    }

    [Fact]
    public async Task Undo_and_redo_move_through_the_steps_and_apply_each_one()
    {
        var history = new UndoHistory();
        var first = new FakeChange("First");
        var second = new FakeChange("Second");
        history.Record(first);
        history.Record(second);

        var undone = await history.UndoAsync();

        Assert.Equal("Second", undone);
        Assert.Equal(1, second.UndoCount);
        Assert.Equal("First", history.UndoDescription);
        Assert.Equal("Second", history.RedoDescription);

        var redone = await history.RedoAsync();

        Assert.Equal("Second", redone);
        Assert.Equal(1, second.RedoCount);
        Assert.False(history.CanRedo);
    }

    [Fact]
    public async Task New_action_after_undo_clears_redo()
    {
        var history = new UndoHistory();
        history.Record(new FakeChange("First"));
        history.Record(new FakeChange("Second"));

        await history.UndoAsync();
        history.Record(new FakeChange("Third"));

        Assert.False(history.CanRedo);
        Assert.Equal("Third", history.UndoDescription);
    }

    [Fact]
    public async Task History_keeps_only_the_most_recent_steps()
    {
        var history = new UndoHistory();

        for (var index = 0; index < UndoHistory.Capacity + 1; index++)
        {
            history.Record(new FakeChange(index.ToString()));
        }

        for (var index = 0; index < UndoHistory.Capacity; index++)
        {
            await history.UndoAsync();
        }

        Assert.Equal(50, UndoHistory.Capacity);
        Assert.False(history.CanUndo);
        Assert.Equal("1", history.RedoDescription);
    }

    [Fact]
    public async Task A_refused_undo_keeps_the_step_available()
    {
        var history = new UndoHistory();
        history.Record(new FakeChange("Refused") { Failure = new DomainRuleException("Nope.") });

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => history.UndoAsync());

        Assert.Equal("Nope.", error.Message);
        Assert.True(history.CanUndo);
        Assert.False(history.CanRedo);
    }

    [Fact]
    public async Task A_refused_redo_keeps_the_step_available()
    {
        var history = new UndoHistory();
        var change = new FakeChange("Refused");
        history.Record(change);
        await history.UndoAsync();
        change.Failure = new DomainRuleException("Nope.");

        await Assert.ThrowsAsync<DomainRuleException>(() => history.RedoAsync());

        Assert.True(history.CanRedo);
        Assert.False(history.CanUndo);
    }

    [Fact]
    public async Task Undo_and_redo_with_nothing_to_do_explain_themselves()
    {
        var history = new UndoHistory();

        var undoError = await Assert.ThrowsAsync<DomainRuleException>(() => history.UndoAsync());
        var redoError = await Assert.ThrowsAsync<DomainRuleException>(() => history.RedoAsync());

        Assert.Equal("There is no action to undo.", undoError.Message);
        Assert.Equal("There is no action to redo.", redoError.Message);
    }

    [Fact]
    public async Task Clear_forgets_undoable_and_redoable_steps()
    {
        var history = new UndoHistory();
        history.Record(new FakeChange("First"));
        history.Record(new FakeChange("Second"));
        await history.UndoAsync();

        history.Clear();

        Assert.False(history.CanUndo);
        Assert.False(history.CanRedo);
    }

    [Fact]
    public async Task Changed_is_raised_by_record_undo_and_redo()
    {
        var history = new UndoHistory();
        var raised = 0;
        history.Changed += (_, _) => raised++;

        history.Record(new FakeChange("Step"));
        await history.UndoAsync();
        await history.RedoAsync();

        Assert.Equal(3, raised);
    }


    [Fact]
    public async Task A_step_recorded_during_an_in_flight_undo_is_kept_and_clears_redo()
    {
        var history = new UndoHistory();
        var gate = new TaskCompletionSource();
        history.Record(new FakeChange("First"));
        history.Record(new FakeChange("Second") { Gate = gate });
        var undo = history.UndoAsync();

        history.Record(new FakeChange("During"));
        gate.SetResult();
        await undo;

        Assert.Equal("During", history.UndoDescription);
        Assert.False(history.CanRedo);
    }

    [Fact]
    public async Task Two_undos_started_together_apply_two_different_steps()
    {
        var history = new UndoHistory();
        var first = new FakeChange("First");
        var second = new FakeChange("Second");
        history.Record(first);
        history.Record(second);

        await Task.WhenAll(history.UndoAsync(), history.UndoAsync());

        Assert.Equal(1, first.UndoCount);
        Assert.Equal(1, second.UndoCount);
        Assert.False(history.CanUndo);
    }

    [Fact]
    public async Task Recording_from_many_threads_loses_nothing()
    {
        var history = new UndoHistory();

        await Task.WhenAll(Enumerable.Range(0, 40).Select(number => Task.Run(() =>
            history.Record(new FakeChange(number.ToString())))));

        var undone = 0;

        while (history.CanUndo)
        {
            await history.UndoAsync();
            undone++;
        }

        Assert.Equal(40, undone);
    }
    private sealed class FakeChange(string description) : IUndoableChange
    {
        public int UndoCount { get; private set; }

        public int RedoCount { get; private set; }

        public DomainRuleException? Failure { get; set; }

        public TaskCompletionSource? Gate { get; set; }

        public string Description => description;

        public async Task UndoAsync(CancellationToken cancellationToken = default)
        {
            await WaitForGateAsync();
            ThrowIfRefused();
            UndoCount++;
        }

        public Task RedoAsync(CancellationToken cancellationToken = default)
        {
            ThrowIfRefused();
            RedoCount++;
            return Task.CompletedTask;
        }

        private async Task WaitForGateAsync()
        {
            if (Gate is not null)
            {
                await Gate.Task;
            }
        }

        private void ThrowIfRefused()
        {
            if (Failure is not null)
            {
                throw Failure;
            }
        }
    }
}