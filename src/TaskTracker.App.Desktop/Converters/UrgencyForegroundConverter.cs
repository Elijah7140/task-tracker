using System.Globalization;

using Avalonia;
using Avalonia.Data.Converters;
using Avalonia.Media;

using TaskTracker.Core.Urgency;

namespace TaskTracker.App.Desktop.Converters;

/// <summary>Uses dark text on pale urgency backgrounds and the theme foreground otherwise.</summary>
public sealed class UrgencyForegroundConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is Urgency.Approaching or Urgency.Imminent or Urgency.Overdue &&
            Application.Current is { } application &&
            application.TryGetResource("UrgencyForegroundBrush", application.ActualThemeVariant,
                out var brush))
        {
            return brush!;
        }

        return AvaloniaProperty.UnsetValue;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotSupportedException();
    }
}