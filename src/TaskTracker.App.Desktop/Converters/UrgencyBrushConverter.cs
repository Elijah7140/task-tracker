using System.Globalization;

using Avalonia;
using Avalonia.Data.Converters;
using Avalonia.Media;

using TaskTracker.Core.Urgency;

namespace TaskTracker.App.Desktop.Converters;

/// <summary>Maps deadline urgency to readable row backgrounds in either theme.</summary>
public sealed class UrgencyBrushConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var key = value switch
        {
            Urgency.Approaching => "UrgencyApproachingBrush",
            Urgency.Imminent or Urgency.Overdue => "UrgencyImmediateBrush",
            _ => null
        };

        if (key is not null && Application.Current is { } application &&
            application.TryGetResource(key, application.ActualThemeVariant, out var brush))
        {
            return brush!;
        }

        return Brushes.Transparent;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotSupportedException();
    }
}