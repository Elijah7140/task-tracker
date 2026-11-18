using Avalonia;
using Avalonia.Controls;
using Avalonia.Data;
using Avalonia.Input;

namespace TaskTracker.App.Desktop.Views;

/// <summary>
/// A combo box for choices that take effect at once (such as a custom field's data type). Bind
/// <see cref="CommittedItem"/> instead of <c>SelectedItem</c>: it changes only when the user settles
/// on an entry, not on every step while browsing.
/// </summary>
/// <remarks>
/// Browsing a closed box with the arrow keys, typing or the mouse wheel only changes the shown entry.
/// The entry is committed when the drop-down closes on a choice, when Enter is pressed, or when focus
/// leaves the box. Escape puts back the committed entry.
/// </remarks>
public sealed class CommitOnChoiceComboBox : ComboBox
{
    public static readonly StyledProperty<object?> CommittedItemProperty =
        AvaloniaProperty.Register<CommitOnChoiceComboBox, object?>(nameof(CommittedItem),
            defaultBindingMode: BindingMode.TwoWay);

    private bool isHandlingUserInput;
    private bool hasPendingChoice;

    /// <summary>The entry the user last settled on; the shown entry may differ while browsing.</summary>
    public object? CommittedItem
    {
        get => GetValue(CommittedItemProperty);
        set => SetValue(CommittedItemProperty, value);
    }

    protected override Type StyleKeyOverride => typeof(ComboBox);

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);

        if (change.Property == CommittedItemProperty || change.Property == ItemsSourceProperty)
        {
            ShowCommittedItem();
        }
        else if (change.Property == SelectedItemProperty)
        {
            NoteSelectionChange();
        }
        else if (change.Property == IsDropDownOpenProperty && !IsDropDownOpen)
        {
            CommitPendingChoice();
        }
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (!IsDropDownOpen && hasPendingChoice && TrySettleWithKey(e.Key))
        {
            e.Handled = true;
            return;
        }

        RunAsUserInput(() => base.OnKeyDown(e));
    }

    protected override void OnTextInput(TextInputEventArgs e)
    {
        RunAsUserInput(() => base.OnTextInput(e));
    }

    protected override void OnPointerWheelChanged(PointerWheelEventArgs e)
    {
        RunAsUserInput(() => base.OnPointerWheelChanged(e));
    }

    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        RunAsUserInput(() => base.OnPointerReleased(e));

        if (!IsDropDownOpen)
        {
            CommitPendingChoice();
        }
    }

    protected override void OnLostFocus(FocusChangedEventArgs e)
    {
        base.OnLostFocus(e);

        if (!IsDropDownOpen)
        {
            CommitPendingChoice();
        }
    }

    /// <summary>Enter commits the browsed entry and Escape puts back the committed one.</summary>
    private bool TrySettleWithKey(Key key)
    {
        if (key == Key.Enter)
        {
            CommitPendingChoice();
            return true;
        }

        if (key == Key.Escape)
        {
            ShowCommittedItem();
            return true;
        }

        return false;
    }

    private void RunAsUserInput(Action handler)
    {
        isHandlingUserInput = true;

        try
        {
            handler();
        }
        finally
        {
            isHandlingUserInput = false;
        }
    }

    /// <summary>
    /// Remembers a selection the user made, to commit once they settle. A change made by code (such as
    /// showing the committed entry) is not a choice and is never written back.
    /// </summary>
    private void NoteSelectionChange()
    {
        if (isHandlingUserInput || IsDropDownOpen)
        {
            hasPendingChoice = !Equals(SelectedItem, CommittedItem);
        }
    }

    private void CommitPendingChoice()
    {
        if (!hasPendingChoice)
        {
            return;
        }

        hasPendingChoice = false;
        SetCurrentValue(CommittedItemProperty, SelectedItem);
    }

    private void ShowCommittedItem()
    {
        hasPendingChoice = false;
        SetCurrentValue(SelectedItemProperty, CommittedItem);
    }
}