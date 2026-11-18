using System.Windows.Input;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Marks rows and the details panel for the item the tray card shows (§7.17).</summary>
public sealed partial class ProjectWorkspaceViewModel
{
    /// <summary>The item the tray card shows, or null when none is chosen.</summary>
    internal Guid? CurrentItemId => navigation.CurrentItemId;

    /// <summary>Whether the item open in the details panel is the current item.</summary>
    public bool IsSelectedItemCurrent => selectedItem is not null && selectedItem.IsCurrent;

    /// <summary>Makes the selected item current, or clears it when it already is.</summary>
    public ICommand ToggleSelectedCurrentCommand { get; }

    /// <summary>Re-reads which row is current after the shell changed it.</summary>
    public void RefreshCurrentItem()
    {
        foreach (var row in AllItems())
        {
            row.RaiseCurrentChanged();
        }

        OnCurrentSelectionChanged();
    }

    internal Task ToggleCurrentAsync(ItemRowViewModel row)
    {
        var next = row.IsCurrent ? (Guid?)null : row.Id;

        return navigation.SetCurrentItemAsync(next);
    }

    private Task ToggleSelectedCurrentAsync()
    {
        return selectedItem is null ? Task.CompletedTask : ToggleCurrentAsync(selectedItem);
    }

    private void OnCurrentSelectionChanged()
    {
        OnPropertyChanged(nameof(IsSelectedItemCurrent));
    }
}