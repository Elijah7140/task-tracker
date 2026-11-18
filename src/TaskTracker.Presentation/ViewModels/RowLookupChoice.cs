using System.Windows.Input;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>An entry in an item row's Set status or Set priority submenu; the current value is checked.</summary>
public sealed record RowLookupChoice(string Label, bool IsCurrent, ICommand Command);