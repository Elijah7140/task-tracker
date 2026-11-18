using Avalonia;
using Avalonia.Controls;
using Avalonia.Data;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.VisualTree;

namespace TaskTracker.App.Desktop.Views;

/// <summary>
/// A combo box for choices that take effect at once (such as a custom field's data type). Bind
/// <see cref="CommittedItem"/> instead of <c>SelectedItem</c>: it changes only when the user chooses
/// an entry, never on a step while browsing.
/// </summary>
/// <remarks>
/// <para>
/// Browsing with the keys (arrows or typing on a closed box, or moving through the open drop-down)
/// only changes the shown entry, which is then pending. A pending entry is applied when the user
/// chooses it: when the drop-down closes on it, when Enter is pressed, when focus leaves the box, or
/// when the pointer is pressed anywhere outside the box. That last rule has the same effect as leaving
/// the box, and covers a click on an area that takes no focus, so a pending entry never lingers.
/// </para>
/// <para>
/// Escape puts the applied entry back, and a box taken off the screen (such as by going back from its
/// page) drops a pending entry without applying it. The mouse wheel does not browse a closed box; it
/// scrolls the page instead. A selection set by code on a closed box, as UI Automation does, is a
/// choice and is applied at once.
/// </para>
/// </remarks>
public sealed class CommitOnChoiceComboBox : ComboBox
{
    public static readonly StyledProperty<object?> CommittedItemProperty =
        AvaloniaProperty.Register<CommitOnChoiceComboBox, object?>(nameof(CommittedItem),
            defaultBindingMode: BindingMode.TwoWay);

    private bool isBrowsingWithKeys;
    private bool hasPendingChoice;

    /// <summary>The window watched for presses outside the box while an entry is pending.</summary>
    private TopLevel? watchedTopLevel;

    /// <summary>The entry the user last chose; the shown entry may differ while browsing.</summary>
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
            OnSelectedItemChanged();
        }
        else if (change.Property == IsDropDownOpenProperty && !IsDropDownOpen)
        {
            CommitPendingChoice();
        }
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (hasPendingChoice && TrySettleWithKey(e.Key))
        {
            e.Handled = true;
            return;
        }

        BrowseWithKeys(() => base.OnKeyDown(e));
    }

    protected override void OnTextInput(TextInputEventArgs e)
    {
        BrowseWithKeys(() => base.OnTextInput(e));
    }

    /// <summary>A closed box leaves the wheel to the page around it, so the page keeps scrolling.</summary>
    protected override void OnPointerWheelChanged(PointerWheelEventArgs e)
    {
        if (IsDropDownOpen)
        {
            base.OnPointerWheelChanged(e);
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

    /// <summary>Runs before focus is cleared from the removed box, so the pending entry is dropped first.</summary>
    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        ShowCommittedItem();
        base.OnDetachedFromVisualTree(e);
    }

    /// <summary>Enter applies the pending entry of a closed box; Escape puts back the applied one.</summary>
    private bool TrySettleWithKey(Key key)
    {
        if (key == Key.Escape)
        {
            ShowCommittedItem();
            SetCurrentValue(IsDropDownOpenProperty, false);
            return true;
        }

        if (key == Key.Enter && !IsDropDownOpen)
        {
            CommitPendingChoice();
            return true;
        }

        return false;
    }

    private void BrowseWithKeys(Action handler)
    {
        isBrowsingWithKeys = true;

        try
        {
            handler();
        }
        finally
        {
            isBrowsingWithKeys = false;
        }
    }

    /// <summary>
    /// A selection made by browsing waits to be applied. Any other selection on a closed box was set by
    /// code, such as UI Automation or <see cref="ShowCommittedItem"/>, and is applied at once (when it
    /// is the applied entry already, that changes nothing). A cleared selection is never applied.
    /// </summary>
    private void OnSelectedItemChanged()
    {
        if (isBrowsingWithKeys || IsDropDownOpen)
        {
            SetPendingChoice(!Equals(SelectedItem, CommittedItem));
        }
        else if (SelectedItem is not null)
        {
            CommitSelection();
        }
    }

    /// <summary>A press outside the box applies the pending entry, as leaving the box with focus does.</summary>
    private void OnPointerPressedAnywhere(object? sender, PointerPressedEventArgs e)
    {
        if (IsDropDownOpen || IsInsideBox(e.Source))
        {
            return;
        }

        CommitPendingChoice();
    }

    private bool IsInsideBox(object? source)
    {
        return source is Visual visual && (visual == this || this.IsVisualAncestorOf(visual));
    }

    private void CommitPendingChoice()
    {
        if (hasPendingChoice)
        {
            CommitSelection();
        }
    }

    private void CommitSelection()
    {
        SetPendingChoice(false);
        SetCurrentValue(CommittedItemProperty, SelectedItem);
    }

    private void ShowCommittedItem()
    {
        SetPendingChoice(false);
        SetCurrentValue(SelectedItemProperty, CommittedItem);
    }

    /// <summary>Presses outside the box are watched only while an entry is pending.</summary>
    private void SetPendingChoice(bool isPending)
    {
        hasPendingChoice = isPending;

        if (isPending)
        {
            WatchPressesOutside();
        }
        else
        {
            StopWatchingPressesOutside();
        }
    }

    private void WatchPressesOutside()
    {
        if (watchedTopLevel is not null)
        {
            return;
        }

        watchedTopLevel = TopLevel.GetTopLevel(this);
        watchedTopLevel?.AddHandler(PointerPressedEvent, OnPointerPressedAnywhere, RoutingStrategies.Tunnel,
            handledEventsToo: true);
    }

    private void StopWatchingPressesOutside()
    {
        watchedTopLevel?.RemoveHandler(PointerPressedEvent, OnPointerPressedAnywhere);
        watchedTopLevel = null;
    }
}