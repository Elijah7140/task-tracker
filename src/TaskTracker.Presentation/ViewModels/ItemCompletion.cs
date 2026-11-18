using TaskTracker.Core.Completion;
using TaskTracker.Core.Items;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Applies the shared complete-subtree confirmation for item actions.</summary>
internal static class ItemCompletion
{
    public static async Task<CompletionResult?> SetAsync(ItemService items, IDialogService dialogs,
        ItemLocation location, Guid itemId, bool completed)
    {
        return await ConfirmAsync(dialogs, confirmed =>
            items.SetCompletedAsync(location.ProjectId, location.FolderId, itemId, completed, confirmed));
    }

    internal static async Task<CompletionResult?> ConfirmAsync(IDialogService dialogs,
        Func<bool, Task<CompletionResult>> change)
    {
        var result = await change(false);
        if (result is not CompletionResult.NeedsConfirmation confirmation)
        {
            return result;
        }

        var message = $"Also complete {confirmation.OpenSubItemCount} open sub-items?";
        if (!await dialogs.ConfirmAsync("Complete sub-items", message, "Complete"))
        {
            return null;
        }

        return await change(true);
    }
}