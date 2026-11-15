using System.ComponentModel;

using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Threading;
using Avalonia.VisualTree;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Displays calendar periods and item entry buttons, and translates drags and Alt+arrows into moves.</summary>
public sealed partial class CalendarView : UserControl
{
    private const string MoreButtonId = "CalendarMoreButton";

    private const double WheelPixelsPerNotch = 48;

    private readonly CalendarDragController drag;

    public CalendarView()
    {
        InitializeComponent();
        var indicator = new CalendarDropIndicator(WeekColumns, WeekDropGhost, WeekDropGhostLabel);
        drag = new CalendarDragController(this, indicator);
        AddHandler(KeyDownEvent, OnPreviewKeyDown, RoutingStrategies.Tunnel);
        AddHandler(PointerWheelChangedEvent, OnWheelDuringDrag);
        WeekScroll.ScrollChanged += (_, _) => drag.RefreshAfterScroll();
    }

    /// <summary>
    /// While an entry is dragged, the calendar holds the pointer capture, so wheel events reach the
    /// calendar and not the week grid under the pointer. Scroll the grid here instead.
    /// </summary>
    private void OnWheelDuringDrag(object? sender, PointerWheelEventArgs args)
    {
        if (!drag.IsDragging || DataContext is not CalendarViewModel { IsWeek: true })
        {
            return;
        }

        var offset = WeekScroll.Offset.Y - args.Delta.Y * WheelPixelsPerNotch;
        WeekScroll.Offset = new Vector(WeekScroll.Offset.X, Math.Max(0, offset));
        args.Handled = true;
    }

    protected override void OnLoaded(RoutedEventArgs args)
    {
        base.OnLoaded(args);

        if (DataContext is CalendarViewModel calendar)
        {
            calendar.PropertyChanged += OnCalendarChanged;
            calendar.FocusEntryRequested += OnFocusEntryRequested;
        }

        ScrollToMorning();
    }

    protected override void OnUnloaded(RoutedEventArgs args)
    {
        drag.Cancel();

        if (DataContext is CalendarViewModel calendar)
        {
            calendar.PropertyChanged -= OnCalendarChanged;
            calendar.FocusEntryRequested -= OnFocusEntryRequested;
        }

        base.OnUnloaded(args);
    }

    private void OnCalendarChanged(object? sender, PropertyChangedEventArgs args)
    {
        if (args.PropertyName == nameof(CalendarViewModel.IsWeek))
        {
            ScrollToMorning();
        }
    }

    private void ScrollToMorning()
    {
        Dispatcher.UIThread.Post(() => WeekScroll.Offset = new Vector(0, CalendarMetrics.MorningOffset),
            DispatcherPriority.Loaded);
    }

    /// <summary>Escape cancels a drag; Alt+arrows on a focused entry move it by a day or 15 minutes.</summary>
    private async void OnPreviewKeyDown(object? sender, KeyEventArgs args)
    {
        if (args.Key == Key.Escape && drag.IsDragging)
        {
            drag.Cancel();
            args.Handled = true;
            return;
        }

        var entryButton = CalendarEntryButton.From(args.Source);
        var step = StepFor(args.Key);

        if (args.KeyModifiers != KeyModifiers.Alt || entryButton is null || step is null
            || DataContext is not CalendarViewModel calendar)
        {
            return;
        }

        args.Handled = true;
        await calendar.MoveEntryByAsync(entryButton.Entry, step.Value.Days, step.Value.Minutes);
    }

    private static (int Days, int Minutes)? StepFor(Key key)
    {
        switch (key)
        {
            case Key.Left:
                return (-1, 0);
            case Key.Right:
                return (1, 0);
            case Key.Up:
                return (0, -CalendarMetrics.SnapMinutes);
            case Key.Down:
                return (0, CalendarMetrics.SnapMinutes);
            default:
                return null;
        }
    }

    private void OnFocusEntryRequested(object? sender, CalendarFocusRequest request)
    {
        Dispatcher.UIThread.Post(() => FocusMovedEntry(request), DispatcherPriority.Background);
    }

    /// <summary>
    /// Focuses the moved entry's button; the reload replaced the focused one. When the entry is not
    /// shown (under its day's "+N more", or outside the visible period) focus goes to that button, or
    /// to Previous or Next, so the keyboard user is never left without focus.
    /// </summary>
    private void FocusMovedEntry(CalendarFocusRequest request)
    {
        UpdateLayout();
        var target = FindEntryButton(request.Key) ?? FindMoreButton(request.Day) ?? PeriodButtonToward(request.Day);
        target?.Focus();
    }

    private Button? FindEntryButton(CalendarEntryKey key)
    {
        return this.GetVisualDescendants()
            .OfType<Button>()
            .Where(button => button.IsEffectivelyVisible)
            .FirstOrDefault(button => IsEntryButtonFor(button, key));
    }

    private static bool IsEntryButtonFor(Button button, CalendarEntryKey key)
    {
        if (button.DataContext is not CalendarEntryViewModel occurrence)
        {
            return false;
        }

        return occurrence.Entry.ItemId == key.ItemId && occurrence.Entry.Kind == key.Kind;
    }

    private Button? FindMoreButton(DateOnly day)
    {
        var cell = this.GetVisualDescendants()
            .OfType<Border>()
            .FirstOrDefault(border => IsMonthCellOf(border, day));

        return cell?.GetVisualDescendants()
            .OfType<Button>()
            .FirstOrDefault(button => button.IsEffectivelyVisible
                && AutomationProperties.GetAutomationId(button) == MoreButtonId);
    }

    private static bool IsMonthCellOf(Border border, DateOnly day)
    {
        return border.Classes.Contains(CalendarDropAreas.MonthCell)
            && border.DataContext is CalendarDayViewModel dayModel
            && dayModel.Date == day;
    }

    private Button? PeriodButtonToward(DateOnly day)
    {
        if (DataContext is not CalendarViewModel calendar || calendar.Days.Count == 0)
        {
            return null;
        }

        return day < calendar.Days[0].Date ? PreviousButton : NextButton;
    }
}