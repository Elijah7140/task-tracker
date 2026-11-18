using TaskTracker.Core.Completion;
using TaskTracker.Core.Items;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Applies a status or priority picked from an item row's menu.</summary>
internal static class ItemLookupAction
{
    /// <summary>
    /// Sets the status, asking first when a Done status would also complete open sub-items, and
    /// explaining when reopening is blocked. Returns whether the change was saved.
    /// </summary>
    public static async Task<bool> SetStatusAsync(ItemService items, IDialogService dialogs, Guid itemId,
        Guid? statusId)
    {
        var result = await ItemCompletion.ConfirmAsync(dialogs,
            confirmed => items.SetStatusAsync(itemId, statusId, confirmed));
        if (result is CompletionResult.Blocked blocked)
        {
            await dialogs.ShowMessageAsync("Cannot reopen item", blocked.Reason);
        }

        return result is CompletionResult.Applied;
    }

    /// <summary>Sets the priority. Returns true, as a priority change never needs confirmation.</summary>
    public static async Task<bool> SetPriorityAsync(ItemService items, Guid itemId, Guid? priorityId)
    {
        await items.SetPriorityAsync(itemId, priorityId);
        return true;
    }
}