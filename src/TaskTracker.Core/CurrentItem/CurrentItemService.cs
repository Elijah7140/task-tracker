using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;

namespace TaskTracker.Core.CurrentItem;

/// <summary>
/// Remembers the one item the user is working on, which the tray card shows (§7.17). The choice
/// is a global setting outside undo history. Every public method is one operation with its own
/// unit of work.
/// </summary>
public sealed class CurrentItemService(IUnitOfWorkFactory unitOfWorkFactory)
{
    private const string AreaSeparator = " › ";

    /// <summary>Returns the current item's id, or null when none is chosen or it is no longer available.</summary>
    public async Task<Guid?> GetIdAsync(CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var item = await FindCurrentAsync(unitOfWork, cancellationToken);

        return item?.Id;
    }

    /// <summary>Returns the current item's card, or null when none is chosen or it is no longer available.</summary>
    public async Task<CurrentItemCard?> GetCardAsync(CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var item = await FindCurrentAsync(unitOfWork, cancellationToken);
        if (item is null)
        {
            return null;
        }

        return await BuildCardAsync(unitOfWork, item, cancellationToken);
    }

    /// <summary>Makes an item current, or clears the choice when <paramref name="itemId"/> is null.</summary>
    public async Task SetAsync(Guid? itemId, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        if (itemId is Guid id && await FindAvailableAsync(unitOfWork, id, cancellationToken) is null)
        {
            throw new DomainRuleException("This item is no longer available.");
        }

        var definition = SettingsCatalogue.CurrentItem;
        await unitOfWork.Settings.SetGlobalAsync(definition.Key, definition.Format(itemId), cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static async Task<TodoItem?> FindCurrentAsync(IUnitOfWork unitOfWork, CancellationToken cancellationToken)
    {
        var values = await unitOfWork.Settings.GetGlobalAsync(cancellationToken);
        if (!values.TryGetValue(SettingsCatalogue.CurrentItem.Key, out var text))
        {
            return null;
        }

        var id = ParseOrNull(text);

        return id is Guid itemId ? await FindAvailableAsync(unitOfWork, itemId, cancellationToken) : null;
    }

    private static Guid? ParseOrNull(string text)
    {
        try
        {
            return SettingsCatalogue.CurrentItem.Parse(text);
        }
        catch (FormatException)
        {
            return null;
        }
    }

    /// <summary>Finds an item that is neither deleted nor inside a deleted project.</summary>
    private static async Task<TodoItem?> FindAvailableAsync(IUnitOfWork unitOfWork, Guid itemId,
        CancellationToken cancellationToken)
    {
        var item = await unitOfWork.Items.FindAsync(itemId, cancellationToken);
        if (item is null || item.DeletedAtUtc is not null)
        {
            return null;
        }

        var project = await unitOfWork.Projects.FindAsync(item.ProjectId, false, cancellationToken);

        return project is null ? null : item;
    }

    private static async Task<CurrentItemCard> BuildCardAsync(IUnitOfWork unitOfWork, TodoItem item,
        CancellationToken cancellationToken)
    {
        var lookups = unitOfWork.Lookups;
        var statuses = await lookups.StatusesAsync(cancellationToken);
        var priorities = await lookups.PriorityLevelsAsync(cancellationToken);
        var status = statuses.FirstOrDefault(entry => entry.Id == item.StatusId);
        var priority = priorities.FirstOrDefault(entry => entry.Id == item.PriorityLevelId);
        var areaPath = await BuildAreaPathAsync(unitOfWork, item, cancellationToken);

        return new CurrentItemCard(item.Id, item.Title, areaPath, status?.Name, priority?.Name,
            item.DueDate, item.DueTime, item.CompletedAtUtc is not null, item.Description);
    }

    private static async Task<string> BuildAreaPathAsync(IUnitOfWork unitOfWork, TodoItem item,
        CancellationToken cancellationToken)
    {
        var project = await unitOfWork.Projects.FindAsync(item.ProjectId, false, cancellationToken);
        var folders = await unitOfWork.Folders.ListAsync(item.ProjectId, false, cancellationToken);
        var names = FolderNames(folders, item.FolderId);
        names.Insert(0, project?.Name ?? string.Empty);

        return string.Join(AreaSeparator, names);
    }

    /// <summary>Returns the names of a folder and its ancestors, outermost first.</summary>
    private static List<string> FolderNames(IReadOnlyList<Folder> folders, Guid? folderId)
    {
        var byId = folders.ToDictionary(folder => folder.Id);
        var names = new List<string>();
        var nextId = folderId;
        while (nextId is Guid id && byId.Remove(id, out var folder))
        {
            names.Insert(0, folder.Name);
            nextId = folder.ParentFolderId;
        }

        return names;
    }
}