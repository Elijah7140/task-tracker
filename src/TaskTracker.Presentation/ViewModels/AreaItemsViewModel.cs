using System.Collections.ObjectModel;

using TaskTracker.Core;
using TaskTracker.Core.Completion;
using TaskTracker.Core.Items;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Builds the open and completed item rows and retains expansion by item ID.</summary>
public sealed class AreaItemsViewModel
{
    private readonly ProjectWorkspaceViewModel workspace;
    private readonly Guid projectId;
    private readonly ItemService? items;
    private readonly IDialogService dialogs;
    private readonly Dictionary<Guid, bool> expanded = [];
    private readonly Dictionary<Guid, bool> completedExpanded = [];

    public AreaItemsViewModel(ProjectWorkspaceViewModel workspace, Guid projectId,
        ItemService? items, IDialogService dialogs)
    {
        this.workspace = workspace;
        this.projectId = projectId;
        this.items = items;
        this.dialogs = dialogs;
    }

    public ObservableCollection<ItemRowViewModel> OpenItems { get; } = [];

    public ObservableCollection<ItemRowViewModel> CompletedItems { get; } = [];

    /// <summary>The open top-level items as cards, grouped by priority (§8).</summary>
    public ObservableCollection<PriorityGroupViewModel> OpenGroups { get; } = [];

    public void Load(AreaSnapshot snapshot, ProjectWorkspaceViewModel workspace)
    {
        RememberExpansion();
        OpenItems.Clear();
        CompletedItems.Clear();
        OpenGroups.Clear();

        foreach (var node in snapshot.Items)
        {
            var row = BuildRow(node, snapshot, workspace);
            (node.IsFinished ? CompletedItems : OpenItems).Add(row);
        }

        SortCompleted(CompletedItems);

        foreach (var group in PriorityGroupBuilder.Build(OpenItems, snapshot.PriorityLevels))
        {
            OpenGroups.Add(group);
        }
    }

    public IEnumerable<ItemRowViewModel> AllItems()
    {
        return OpenItems.Concat(CompletedItems).SelectMany(Walk);
    }

    private ItemRowViewModel BuildRow(ItemNode node, AreaSnapshot snapshot,
        ProjectWorkspaceViewModel workspace)
    {
        var row = new ItemRowViewModel(node, workspace)
        {
            IsExpanded = expanded.GetValueOrDefault(node.Item.Id),
            IsCompletedExpanded = completedExpanded.GetValueOrDefault(node.Item.Id),
            TypeName = snapshot.ItemTypes.FirstOrDefault(type => type.Id == node.Item.ItemTypeId)?.Name,
            PriorityName = snapshot.PriorityLevels.FirstOrDefault(level => level.Id == node.Item.PriorityLevelId)?.Label,
            SourceTitle = FindTitle(snapshot.Items, node.DisplayedUrgency.SourceDescendantId)
        };

        AttachLookupMenus(row, snapshot);

        foreach (var child in node.Children)
        {
            var childRow = BuildRow(child, snapshot, workspace);
            (child.IsFinished ? row.CompletedChildren : row.Children).Add(childRow);
        }

        SortCompleted(row.CompletedChildren);
        return row;
    }

    private void RememberExpansion()
    {
        foreach (var row in AllItems())
        {
            expanded[row.Id] = row.IsExpanded;
            completedExpanded[row.Id] = row.IsCompletedExpanded;
        }
    }

    private static IEnumerable<ItemRowViewModel> Walk(ItemRowViewModel row)
    {
        yield return row;

        foreach (var child in row.Children.Concat(row.CompletedChildren).SelectMany(Walk))
        {
            yield return child;
        }
    }

    private static string? FindTitle(IEnumerable<ItemNode> nodes, Guid? id)
    {
        foreach (var node in nodes)
        {
            if (node.Item.Id == id)
            {
                return node.Item.Title;
            }

            var title = FindTitle(node.Children, id);

            if (title is not null)
            {
                return title;
            }
        }

        return null;
    }

    private static void SortCompleted(ObservableCollection<ItemRowViewModel> rows)
    {
        var ordered = rows.OrderByDescending(row => row.Node.Item.CompletedAtUtc).ToArray();
        rows.Clear();

        foreach (var row in ordered)
        {
            rows.Add(row);
        }
    }
    public async Task QuickAddAsync()
    {
        if (items is null || string.IsNullOrWhiteSpace(workspace.QuickAddTitle) || !await workspace.ResolveDraftAsync())
        {
            return;
        }

        try
        {
            var created = await items.CreateAsync(projectId, workspace.SelectedFolder?.Id, null, workspace.QuickAddTitle);
            workspace.QuickAddTitle = string.Empty;
            await workspace.LoadItemsAsync(created.Id);
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Item action failed", exception.Message);
        }
    }

    public async Task AddSubItemAsync()
    {
        if (items is null || workspace.SelectedItem is null || !await workspace.ResolveDraftAsync())
        {
            return;
        }

        var title = await dialogs.PromptAsync("New sub-item", "Title");

        if (title is null)
        {
            return;
        }

        try
        {
            var created = await items.CreateAsync(projectId, workspace.SelectedFolder?.Id, workspace.SelectedItem!.Id, title);
            for (var ancestor = workspace.SelectedItem; ancestor is not null;
                ancestor = AllItems().FirstOrDefault(row => row.Id == ancestor.ParentId))
            {
                ancestor.IsExpanded = true;
            }

            await workspace.LoadItemsAsync(created.Id);
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Item action failed", exception.Message);
        }
    }

    public async Task ToggleAsync(ItemRowViewModel row)
    {
        if (items is null || !await workspace.ResolveDraftAsync())
        {
            return;
        }

        try
        {
            await ToggleCoreAsync(row);
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Item action failed", exception.Message);
        }
        finally
        {
            row.RefreshCompletionState();
        }
    }

    private async Task ToggleCoreAsync(ItemRowViewModel row)
    {
        if (items is null)
        {
            return;
        }

        var location = new ItemLocation(projectId, workspace.SelectedFolder?.Id);
        var result = await ItemCompletion.SetAsync(items, dialogs, location, row.Id, !row.IsComplete);
        if (result is null)
        {
            return;
        }

        if (result is CompletionResult.Blocked blocked)
        {
            await dialogs.ShowMessageAsync("Cannot reopen item", blocked.Reason);
            return;
        }

        await workspace.LoadItemsAsync(row.Id);
        if (result is CompletionResult.Applied { LastRepeat: true })
        {
            workspace.ReportLastRepeat();
        }
    }

    private void AttachLookupMenus(ItemRowViewModel row, AreaSnapshot snapshot)
    {
        var item = row.Node.Item;
        var menus = new RowLookupMenus(snapshot.Statuses, snapshot.PriorityLevels);
        row.StatusName = menus.StatusName(item.StatusId);
        row.StatusChoices = menus.Statuses(item.StatusId,
            id => ChangeRowAsync(service => ItemLookupAction.SetStatusAsync(service, dialogs, row.Id, id)));
        row.PriorityChoices = menus.Priorities(item.PriorityLevelId,
            id => ChangeRowAsync(service => ItemLookupAction.SetPriorityAsync(service, row.Id, id)));
    }

    /// <summary>Resolves any editor draft, applies a row-menu change and reloads the area when it was saved.</summary>
    private async Task ChangeRowAsync(Func<ItemService, Task<bool>> change)
    {
        if (items is null || !await workspace.ResolveDraftAsync())
        {
            return;
        }

        try
        {
            if (await change(items))
            {
                await workspace.LoadItemsAsync(workspace.SelectedItem?.Id);
            }
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Item action failed", exception.Message);
        }
    }

    internal async Task PushBackAsync(ItemRowViewModel row)
    {
        if (items is null || !await workspace.ResolveDraftAsync())
        {
            return;
        }

        try
        {
            await items.PushBackOneDayAsync(row.Id);
            await workspace.LoadItemsAsync(workspace.SelectedItem?.Id);
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Push back one day", exception.Message);
        }
    }

    internal async Task ChangeRepeatAsync(ItemRowViewModel row, bool skip)
    {
        if (items is null || !await workspace.ResolveDraftAsync())
        {
            return;
        }

        try
        {
            if (skip && !await items.SkipRepeatAsync(row.Id))
            {
                workspace.ReportLastRepeat();
                return;
            }

            if (!skip)
            {
                await items.StopRepeatingAsync(row.Id);
            }

            await workspace.LoadItemsAsync(row.Id);
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Item action failed", exception.Message);
        }
    }

    public async Task ToggleSelectedAsync()
    {
        if (workspace.SelectedItem is not null)
        {
            await ToggleAsync(workspace.SelectedItem);
        }
    }

    public async Task DeleteItemAsync()
    {
        if (items is null || workspace.SelectedItem is null || !await workspace.ResolveDraftAsync() ||
            !await dialogs.ConfirmAsync("Delete item", $"Delete {workspace.SelectedItem!.Title} and its sub-items?", "Delete"))
        {
            return;
        }

        try
        {
            var parentId = workspace.SelectedItem!.ParentId;
            await items.DeleteAsync(projectId, workspace.SelectedFolder?.Id, workspace.SelectedItem!.Id);
            await workspace.LoadItemsAsync(parentId);
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Item action failed", exception.Message);
        }
    }

    public async Task ReorderSelectedAsync(int offset)
    {
        if (items is null || workspace.SelectedItem is null || !await workspace.ResolveDraftAsync())
        {
            return;
        }

        var siblings = AllItems().Where(row => row.ParentId == workspace.SelectedItem!.ParentId)
            .OrderBy(row => row.Node.Item.SortOrder).ToList();
        var visible = siblings.Where(row => row.IsFinished == workspace.SelectedItem!.IsFinished).ToList();
        var index = visible.FindIndex(row => row.Id == workspace.SelectedItem!.Id);
        var target = index + offset;

        if (target < 0 || target >= visible.Count)
        {
            return;
        }

        (visible[index], visible[target]) = (visible[target], visible[index]);
        var visibleIds = new Queue<Guid>(visible.Select(row => row.Id));
        var order = siblings.Select(row => row.IsFinished == workspace.SelectedItem!.IsFinished
            ? visibleIds.Dequeue()
            : row.Id).ToArray();
        try
        {
            await items.ReorderAsync(projectId, workspace.SelectedFolder?.Id, workspace.SelectedItem!.ParentId, order);
            await workspace.LoadItemsAsync(workspace.SelectedItem!.Id);
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Item action failed", exception.Message);
        }
    }

}