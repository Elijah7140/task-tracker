using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Threading;
using Avalonia.VisualTree;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>
/// An empty time picker must not look as if it held a value, and must look the same at any time of
/// day, so its AM/PM column shows a neutral "--" until a time is chosen.
/// </summary>
public sealed class TimePickerPlaceholderTests
{
    [AvaloniaFact]
    public void An_empty_time_picker_shows_dashes_instead_of_the_current_period()
    {
        var picker = new TimePicker();
        var window = Show(picker);

        var period = PeriodText(picker);

        Assert.Equal("--", period);
        window.Close();
    }

    [AvaloniaFact]
    public void A_chosen_time_shows_its_period_and_clearing_it_shows_dashes_again()
    {
        var picker = new TimePicker { SelectedTime = new TimeSpan(14, 30, 0) };
        var window = Show(picker);
        var afternoon = PeriodText(picker);

        picker.SelectedTime = null;
        Dispatcher.UIThread.RunJobs();

        Assert.Equal("PM", afternoon);
        Assert.Equal("--", PeriodText(picker));
        window.Close();
    }

    [AvaloniaFact]
    public void The_date_picker_button_shows_a_static_icon_rather_than_the_day_number()
    {
        var picker = new CalendarDatePicker();
        var window = Show(picker);

        var button = picker.GetVisualDescendants().OfType<Button>().Single(candidate => candidate.Name == "PART_Button");

        Assert.Empty(button.GetVisualDescendants().OfType<TextBlock>());
        Assert.NotEmpty(button.GetVisualDescendants().OfType<Avalonia.Controls.Shapes.Path>());
        window.Close();
    }

    private static Window Show(Control picker)
    {
        var window = new Window { Width = 400, Height = 200, Content = picker };
        window.Show();
        Dispatcher.UIThread.RunJobs();

        return window;
    }

    private static string? PeriodText(TimePicker picker)
    {
        var period = picker.GetVisualDescendants().OfType<TextBlock>().Single(text => text.Name == "PART_PeriodTextBlock");

        return period.Text;
    }
}