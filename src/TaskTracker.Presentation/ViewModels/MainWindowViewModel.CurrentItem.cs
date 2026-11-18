using TaskTracker.Core;
using TaskTracker.Core.CurrentItem;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Chooses the item the tray card shows and opens it from the card (§7.17).</summary>
public sealed partial class MainWindowViewModel
{
    private Guid? currentItemId;

    /// <inheritdoc />
    public Guid? CurrentItemId => currentItemId;

    /// <summary>Reads the stored current item, for example at startup.</summary>
    public async Task LoadCurrentItemAsync()
    {
        if (currentItems is null)
        {
            return;
        }

        currentItemId = await currentItems.GetIdAsync();
        (CurrentPage as ProjectWorkspaceViewModel)?.RefreshCurrentItem();
    }

    /// <inheritdoc />
    public async Task SetCurrentItemAsync(Guid? itemId)
    {
        if (currentItems is null)
        {
            return;
        }

        try
        {
            await currentItems.SetAsync(itemId);
            currentItemId = itemId;
            (CurrentPage as ProjectWorkspaceViewModel)?.RefreshCurrentItem();
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Current item", exception.Message);
        }
        catch (Exception exception)
        {
            await ReportUnexpectedErrorAsync(exception);
        }
    }

    /// <summary>Returns the current item's card, or null when none is chosen or it is gone.</summary>
    public async Task<CurrentItemCard?> LoadCurrentItemCardAsync()
    {
        return currentItems is null ? null : await currentItems.GetCardAsync();
    }

    /// <summary>Opens an item in its workspace from outside the page flow, such as the tray card.</summary>
    public Task<SearchOpenOutcome> OpenItemAsync(Guid itemId)
    {
        return OpenReminderItemAsync(itemId);
    }
}