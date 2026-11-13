using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Creates item drafts and resolves edits before the workspace changes context.</summary>
public sealed class ItemEditorCoordinator
{
    private readonly IDialogService dialogs;

    public ItemEditorCoordinator(IDialogService dialogs)
    {
        this.dialogs = dialogs;
    }

    /// <summary>Creates a draft while retaining archived values until the user replaces them.</summary>
    public ItemEditorViewModel Create(ItemRowViewModel row, AreaSnapshot? snapshot)
    {
        var draft = new ItemEditorViewModel(row.Node.Item);
        draft.SelectedType = snapshot?.ItemTypes.FirstOrDefault(type => type.Id == row.Node.Item.ItemTypeId);
        draft.SelectedPriority = snapshot?.PriorityLevels.FirstOrDefault(level => level.Id == row.Node.Item.PriorityLevelId);

        if (draft.SelectedType?.IsArchived == true)
        {
            draft.ArchivedTypeName = draft.SelectedType.Name;
            draft.SelectedType = null;
        }

        if (draft.SelectedPriority?.IsArchived == true)
        {
            draft.ArchivedPriorityName = draft.SelectedPriority.Name;
            draft.SelectedPriority = null;
        }

        return draft;
    }

    /// <summary>Returns false when cancellation or failed validation must abort an action.</summary>
    public async Task<bool> ResolveAsync(ItemEditorViewModel? draft, TodoItem? item,
        Func<Task<bool>> save, Action discard)
    {
        if (draft is null || item is null)
        {
            return true;
        }

        bool isDirty;

        try
        {
            isDirty = draft.IsDirty(item);
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Item validation", exception.Message);
            return false;
        }

        if (!isDirty)
        {
            return true;
        }

        return await ResolveDecisionAsync(await dialogs.ResolveDraftAsync(), save, discard);
    }

    private static async Task<bool> ResolveDecisionAsync(DraftDecision decision, Func<Task<bool>> save,
        Action discard)
    {
        if (decision == DraftDecision.Discard)
        {
            discard();
            return true;
        }

        return decision switch
        {
            DraftDecision.Save => await save(),
            _ => false
        };
    }
}