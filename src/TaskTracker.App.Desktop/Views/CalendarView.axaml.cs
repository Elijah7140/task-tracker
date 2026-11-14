using System.ComponentModel;

using Avalonia;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Threading;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Displays calendar periods and item entry buttons.</summary>
public sealed partial class CalendarView : UserControl
{
    public CalendarView()
    {
        InitializeComponent();
    }

    protected override void OnLoaded(RoutedEventArgs args)
    {
        base.OnLoaded(args);

        if (DataContext is CalendarViewModel calendar)
        {
            calendar.PropertyChanged += OnCalendarChanged;
        }

        ScrollToMorning();
    }

    protected override void OnUnloaded(RoutedEventArgs args)
    {
        if (DataContext is CalendarViewModel calendar)
        {
            calendar.PropertyChanged -= OnCalendarChanged;
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
}