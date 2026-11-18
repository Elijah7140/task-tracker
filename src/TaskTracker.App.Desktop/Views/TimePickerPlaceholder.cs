using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;

namespace TaskTracker.App.Desktop.Views;

/// <summary>
/// Makes an empty <see cref="TimePicker"/> show "--" in its AM/PM column. Avalonia fills that column
/// with the current period even when no time is set, which looks like a value and changes with the
/// time of day. App.axaml turns this on for every time picker.
/// </summary>
public static class TimePickerPlaceholder
{
    /// <summary>The text shown in the AM/PM column while no time is set.</summary>
    public const string EmptyPeriodText = "--";

    public static readonly AttachedProperty<bool> ShowsNeutralPeriodProperty =
        AvaloniaProperty.RegisterAttached<TimePicker, bool>("ShowsNeutralPeriod", typeof(TimePickerPlaceholder));

    /// <summary>The picker's AM/PM text block, found when its template is applied.</summary>
    private static readonly AttachedProperty<TextBlock?> PeriodTextBlockProperty =
        AvaloniaProperty.RegisterAttached<TimePicker, TextBlock?>("PeriodTextBlock", typeof(TimePickerPlaceholder));

    static TimePickerPlaceholder()
    {
        ShowsNeutralPeriodProperty.Changed.AddClassHandler<TimePicker>(OnShowsNeutralPeriodChanged);
    }

    public static bool GetShowsNeutralPeriod(TimePicker picker)
    {
        return picker.GetValue(ShowsNeutralPeriodProperty);
    }

    public static void SetShowsNeutralPeriod(TimePicker picker, bool value)
    {
        picker.SetValue(ShowsNeutralPeriodProperty, value);
    }

    /// <summary>Set by the style before the template is applied, so the first template is always seen.</summary>
    private static void OnShowsNeutralPeriodChanged(TimePicker picker, AvaloniaPropertyChangedEventArgs change)
    {
        picker.TemplateApplied -= OnTemplateApplied;
        picker.PropertyChanged -= OnPickerPropertyChanged;

        if (GetShowsNeutralPeriod(picker))
        {
            picker.TemplateApplied += OnTemplateApplied;
            picker.PropertyChanged += OnPickerPropertyChanged;
        }
    }

    /// <summary>Runs after the picker has written its own period text from the new template.</summary>
    private static void OnTemplateApplied(object? sender, TemplateAppliedEventArgs e)
    {
        var picker = (TimePicker)sender!;
        picker.SetValue(PeriodTextBlockProperty, e.NameScope.Find<TextBlock>("PART_PeriodTextBlock"));
        ShowNeutralPeriodIfEmpty(picker);
    }

    /// <summary>
    /// Runs after the picker's own property handler, which rewrites the period text whenever the time
    /// or the clock layout changes.
    /// </summary>
    private static void OnPickerPropertyChanged(object? sender, AvaloniaPropertyChangedEventArgs e)
    {
        if (e.Property == TimePicker.SelectedTimeProperty ||
            e.Property == TimePicker.ClockIdentifierProperty ||
            e.Property == TimePicker.UseSecondsProperty ||
            e.Property == TimePicker.MinuteIncrementProperty ||
            e.Property == TimePicker.SecondIncrementProperty)
        {
            ShowNeutralPeriodIfEmpty((TimePicker)sender!);
        }
    }

    private static void ShowNeutralPeriodIfEmpty(TimePicker picker)
    {
        var period = picker.GetValue(PeriodTextBlockProperty);

        if (picker.SelectedTime is null && period is not null)
        {
            period.Text = EmptyPeriodText;
        }
    }
}