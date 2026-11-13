using System.Globalization;

using Avalonia.Data.Converters;
using Avalonia.Media;

namespace TaskTracker.App.Desktop.Converters;

/// <summary>Strikes through completed titles, including parents with open children.</summary>
public sealed class CompletionDecorationsConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return value is true ? TextDecorations.Strikethrough : null;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotSupportedException();
    }
}