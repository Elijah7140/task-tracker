using System.Globalization;

using Avalonia.Data.Converters;
using Avalonia.Media;

namespace TaskTracker.App.Desktop.Converters;

/// <summary>Emphasizes overdue titles while keeping other titles at normal weight.</summary>
public sealed class UrgencyWeightConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return value is true ? FontWeight.Bold : FontWeight.Normal;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotSupportedException();
    }
}