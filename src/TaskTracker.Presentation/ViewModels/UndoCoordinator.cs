using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Undo;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Undo and redo as the user sees them: two commands with tooltips naming the action, a status
/// message, and the rules for when a step may run. It applies a step through
/// <see cref="UndoHistory"/>, then asks the host to reload the screen on show.
/// </summary>
public sealed class UndoCoordinator : ViewModelBase
{
    private const string UnsavedEditsMessage = "Save or discard your item edits before undoing or redoing.";

    private readonly UndoHistory history;
    private readonly IUndoHost host;
    private readonly AsyncRelayCommand undoCommand;
    private readonly AsyncRelayCommand redoCommand;
    private string? status;
    private bool isBusy;

    public UndoCoordinator(UndoHistory history, IUndoHost host)
    {
        this.history = history;
        this.host = host;
        undoCommand = new AsyncRelayCommand(UndoAsync, () => history.CanUndo);
        redoCommand = new AsyncRelayCommand(RedoAsync, () => history.CanRedo);
        history.Changed += (_, _) => OnHistoryChanged();
    }

    public ICommand UndoCommand => undoCommand;

    public ICommand RedoCommand => redoCommand;

    /// <summary>"Undo: Complete 'Write report'", or just "Undo" when there is nothing to undo.</summary>
    public string UndoTooltip => TooltipFor("Undo", history.UndoDescription);

    /// <summary>"Redo: Complete 'Write report'", or just "Redo" when there is nothing to redo.</summary>
    public string RedoTooltip => TooltipFor("Redo", history.RedoDescription);

    /// <summary>What the last undo or redo did, or why it was refused; empty when there is nothing to say.</summary>
    public string? Status
    {
        get => status;
        private set
        {
            if (SetProperty(ref status, value))
            {
                OnPropertyChanged(nameof(HasStatus));
            }
        }
    }

    /// <summary>Whether there is a status message to show.</summary>
    public bool HasStatus => !string.IsNullOrEmpty(Status);

    /// <summary>Undoes the latest recorded action, then reloads the screen on show. Does nothing when there is none.</summary>
    public async Task UndoAsync()
    {
        if (history.CanUndo)
        {
            await ApplyAsync(() => history.UndoAsync(), "Undid");
        }
    }

    /// <summary>Redoes the most recently undone action, then reloads the screen on show. Does nothing when there is none.</summary>
    public async Task RedoAsync()
    {
        if (history.CanRedo)
        {
            await ApplyAsync(() => history.RedoAsync(), "Redid");
        }
    }

    /// <summary>Forgets the status message, for example when the user goes to another screen.</summary>
    public void ClearStatus()
    {
        Status = null;
    }

    private async Task ApplyAsync(Func<Task<string>> applyStep, string pastTense)
    {
        if (isBusy)
        {
            return;
        }

        isBusy = true;

        try
        {
            if (host.HasUnsavedEdits)
            {
                Status = UnsavedEditsMessage;
                await host.ReportRefusalAsync(UnsavedEditsMessage);
                return;
            }

            await ApplyAndReloadAsync(applyStep, pastTense);
        }
        finally
        {
            isBusy = false;
        }
    }

    private async Task ApplyAndReloadAsync(Func<Task<string>> applyStep, string pastTense)
    {
        try
        {
            var description = await applyStep();
            Status = $"{pastTense}: {description}";
            await host.ReloadAsync();
        }
        catch (DomainRuleException exception)
        {
            Status = exception.Message;
            await host.ReportRefusalAsync(exception.Message);
        }
        catch (Exception exception)
        {
            await host.ReportUnexpectedErrorAsync(exception);
        }
    }

    private void OnHistoryChanged()
    {
        Status = null;
        undoCommand.NotifyCanExecuteChanged();
        redoCommand.NotifyCanExecuteChanged();
        OnPropertyChanged(nameof(UndoTooltip));
        OnPropertyChanged(nameof(RedoTooltip));
    }

    private static string TooltipFor(string verb, string? description)
    {
        if (description is null)
        {
            return verb;
        }

        return $"{verb}: {description}";
    }
}