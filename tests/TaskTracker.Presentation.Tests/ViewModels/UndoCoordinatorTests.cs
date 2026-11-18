#pragma warning disable xUnit1051
using TaskTracker.Core;
using TaskTracker.Core.Undo;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>The undo and redo rules of the coordinator, against a fake host and fake steps.</summary>
public sealed class UndoCoordinatorTests
{
    [Fact]
    public async Task Undo_with_an_empty_history_does_nothing_and_says_nothing()
    {
        var scenario = new Scenario();

        await scenario.Undo.UndoAsync();
        await scenario.Undo.RedoAsync();

        Assert.Null(scenario.Undo.Status);
        Assert.Equal(0, scenario.Host.ReloadCount);
        Assert.Empty(scenario.Host.Refusals);
    }

    [Fact]
    public async Task Undo_and_redo_report_the_step_and_reload_the_screen()
    {
        var scenario = new Scenario();
        scenario.History.Record(new FakeStep("Complete 'Task'"));

        await scenario.Undo.UndoAsync();

        Assert.Equal("Undid: Complete 'Task'", scenario.Undo.Status);
        Assert.True(scenario.Undo.HasStatus);
        Assert.Equal(1, scenario.Host.ReloadCount);

        await scenario.Undo.RedoAsync();

        Assert.Equal("Redid: Complete 'Task'", scenario.Undo.Status);
        Assert.Equal(2, scenario.Host.ReloadCount);
    }

    [Fact]
    public async Task Commands_and_tooltips_follow_the_history()
    {
        var scenario = new Scenario();
        Assert.False(scenario.Undo.UndoCommand.CanExecute(null));
        Assert.Equal("Undo", scenario.Undo.UndoTooltip);

        scenario.History.Record(new FakeStep("Edit 'Task'"));

        Assert.True(scenario.Undo.UndoCommand.CanExecute(null));
        Assert.Equal("Undo: Edit 'Task'", scenario.Undo.UndoTooltip);

        await scenario.Undo.UndoAsync();

        Assert.True(scenario.Undo.RedoCommand.CanExecute(null));
        Assert.Equal("Redo: Edit 'Task'", scenario.Undo.RedoTooltip);
    }

    [Fact]
    public async Task A_new_recorded_step_clears_the_status()
    {
        var scenario = new Scenario();
        scenario.History.Record(new FakeStep("First"));
        await scenario.Undo.UndoAsync();

        scenario.History.Record(new FakeStep("Second"));

        Assert.False(scenario.Undo.HasStatus);
    }

    [Fact]
    public async Task Unsaved_edits_block_the_step_and_leave_the_history_alone()
    {
        const string draftMessage = "Save or discard your item edits before undoing or redoing.";
        var scenario = new Scenario { Host = { UndoBlockedReason = draftMessage } };
        scenario.History.Record(new FakeStep("Step"));

        await scenario.Undo.UndoAsync();

        Assert.Equal(draftMessage, scenario.Undo.Status);
        Assert.True(scenario.History.CanUndo);
        Assert.Equal(0, scenario.Host.ReloadCount);
    }

    [Fact]
    public async Task A_refused_step_shows_the_message_and_asks_the_host_to_report_it()
    {
        var scenario = new Scenario();
        scenario.History.Record(new FakeStep("Step") { Failure = new DomainRuleException("This item changed since; can't undo.") });

        await scenario.Undo.UndoAsync();

        Assert.Equal("This item changed since; can't undo.", scenario.Undo.Status);
        Assert.Equal(["This item changed since; can't undo."], scenario.Host.Refusals);
        Assert.Empty(scenario.Host.Unexpected);
    }

    [Fact]
    public async Task An_unexpected_failure_goes_to_the_host_instead_of_escaping()
    {
        var scenario = new Scenario();
        scenario.History.Record(new FakeStep("Step") { Crash = new InvalidOperationException("Boom") });

        await scenario.Undo.UndoAsync();

        Assert.Equal("Boom", Assert.Single(scenario.Host.Unexpected).Message);
        Assert.True(scenario.History.CanUndo);
    }

    [Fact]
    public async Task A_failing_reload_is_reported_too()
    {
        var scenario = new Scenario { Host = { ReloadFailure = new InvalidOperationException("Reload failed") } };
        scenario.History.Record(new FakeStep("Step"));

        await scenario.Undo.UndoAsync();

        Assert.Equal("Reload failed", Assert.Single(scenario.Host.Unexpected).Message);
    }

    [Fact]
    public async Task Clearing_the_status_hides_the_message()
    {
        var scenario = new Scenario();
        scenario.History.Record(new FakeStep("Step"));
        await scenario.Undo.UndoAsync();

        scenario.Undo.ClearStatus();

        Assert.False(scenario.Undo.HasStatus);
    }

    private sealed class Scenario
    {
        public Scenario()
        {
            History = new UndoHistory();
            Host = new FakeHost();
            Undo = new UndoCoordinator(History, Host);
        }

        public UndoHistory History { get; }

        public FakeHost Host { get; }

        public UndoCoordinator Undo { get; }
    }

    private sealed class FakeHost : IUndoHost
    {
        public string? UndoBlockedReason { get; set; }

        public int ReloadCount { get; private set; }

        public Exception? ReloadFailure { get; set; }

        public List<string> Refusals { get; } = [];

        public List<Exception> Unexpected { get; } = [];

        public Task ReloadAsync()
        {
            ReloadCount++;

            if (ReloadFailure is not null)
            {
                throw ReloadFailure;
            }

            return Task.CompletedTask;
        }

        public Task ReportRefusalAsync(string message)
        {
            Refusals.Add(message);
            return Task.CompletedTask;
        }

        public Task ReportUnexpectedErrorAsync(Exception exception)
        {
            Unexpected.Add(exception);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeStep(string description) : IUndoableChange
    {
        public DomainRuleException? Failure { get; init; }

        public Exception? Crash { get; init; }

        public string Description => description;

        public Task UndoAsync(CancellationToken cancellationToken = default)
        {
            return Apply();
        }

        public Task RedoAsync(CancellationToken cancellationToken = default)
        {
            return Apply();
        }

        private Task Apply()
        {
            if (Failure is not null)
            {
                throw Failure;
            }

            if (Crash is not null)
            {
                throw Crash;
            }

            return Task.CompletedTask;
        }
    }
}