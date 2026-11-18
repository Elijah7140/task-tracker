using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>
/// A Set status or Set priority menu item whose submenu is built from <see cref="Choices"/>.
/// Each entry is a native check menu item, so the current value shows a check mark and screen
/// readers report it as checked.
/// </summary>
public sealed class RowLookupMenuItem : MenuItem
{
    public static readonly StyledProperty<IReadOnlyList<RowLookupChoice>?> ChoicesProperty =
        AvaloniaProperty.Register<RowLookupMenuItem, IReadOnlyList<RowLookupChoice>?>(nameof(Choices));

    public IReadOnlyList<RowLookupChoice>? Choices
    {
        get => GetValue(ChoicesProperty);
        set => SetValue(ChoicesProperty, value);
    }

    protected override Type StyleKeyOverride => typeof(MenuItem);

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);
        if (change.Property == ChoicesProperty)
        {
            ItemsSource = Choices?.Select(CreateEntry).ToArray();
        }
    }

    private static MenuItem CreateEntry(RowLookupChoice choice)
    {
        var entry = new ChoiceMenuItem(choice);
        AutomationProperties.SetAutomationId(entry, "LookupChoice");
        AutomationProperties.SetName(entry, choice.Label);
        return entry;
    }

    private sealed class ChoiceMenuItem : MenuItem
    {
        private readonly bool isCurrent;

        static ChoiceMenuItem()
        {
            IsCheckedProperty.OverrideMetadata<ChoiceMenuItem>(
                new StyledPropertyMetadata<bool>(coerce: (item, _) => ((ChoiceMenuItem)item).isCurrent));
        }

        public ChoiceMenuItem(RowLookupChoice choice)
        {
            isCurrent = choice.IsCurrent;
            Header = choice.Label;
            Command = choice.Command;
            ToggleType = MenuItemToggleType.CheckBox;
            CoerceValue(IsCheckedProperty);
        }

        protected override Type StyleKeyOverride => typeof(MenuItem);
    }
}