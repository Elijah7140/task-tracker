namespace TaskTracker.Presentation.ViewModels;

/// <summary>What <see cref="UndoCoordinator"/> needs from the window around it.</summary>
public interface IUndoHost
{
    /// <summary>Explains which draft blocks undo and redo, or returns null when a step can run.</summary>
    string? UndoBlockedReason { get; }

    /// <summary>Reloads whatever screen is on show after a step was applied.</summary>
    Task ReloadAsync();

    /// <summary>Tells the user a step was refused, on screens that have no status line of their own.</summary>
    Task ReportRefusalAsync(string message);

    /// <summary>Reports a failure nobody planned for instead of letting it crash the app.</summary>
    Task ReportUnexpectedErrorAsync(Exception exception);
}