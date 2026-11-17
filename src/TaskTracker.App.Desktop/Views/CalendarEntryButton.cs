using Avalonia;
using Avalonia.Controls;
using Avalonia.VisualTree;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>A calendar entry button together with the entry occurrence it shows.</summary>
internal sealed record CalendarEntryButton(Button Button, CalendarEntryViewModel Entry)
{
    /// <summary>
    /// Walks up from an event source to the entry button around it. Returns null when the source is
    /// not part of an entry, for example a "+N more" button, a scrollbar or an empty cell.
    /// </summary>
    public static CalendarEntryButton? From(object? source)
    {
        var button = (source as Visual)?.FindAncestorOfType<Button>(includeSelf: true);

        if (button?.DataContext is CalendarEntryViewModel entry)
        {
            return new CalendarEntryButton(button, entry);
        }

        return null;
    }
}