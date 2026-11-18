namespace TaskTracker.Core.Undo;

/// <summary>
/// The names of undoable user actions, such as "Complete 'Write report'". A service records an
/// action by passing one of these to <c>IUnitOfWork.SaveChangesAsync</c>; a save without a label is
/// never recorded. Search the services for <c>UndoLabels.</c> to see everything that can be undone.
/// </summary>
public static class UndoLabels
{
    public static string SnoozeReminder(string title) => $"Snooze reminder for '{title}'";

    public static string SetRecurrence(string title) => $"Set repeat for '{title}'";

    public static string SkipRepeat(string title) => $"Skip repeat for '{title}'";

    public static string StopRepeating(string title) => $"Stop repeating '{title}'";

    /// <summary>Creating a project, folder, item or sub-item.</summary>
    public static string Create(string name)
    {
        return Label("Create", name);
    }

    /// <summary>One save of an item's fields.</summary>
    public static string Edit(string name)
    {
        return Label("Edit", name);
    }

    /// <summary>Marking an item complete, with any parents it completes.</summary>
    public static string Complete(string name)
    {
        return Label("Complete", name);
    }

    /// <summary>Reopening an item, with any parents it reopens.</summary>
    public static string Reopen(string name)
    {
        return Label("Reopen", name);
    }

    /// <summary>Deleting an item, folder or project with everything inside it.</summary>
    public static string Delete(string name)
    {
        return Label("Delete", name);
    }

    /// <summary>Restoring a deletion batch from the trash.</summary>
    public static string Restore(string name)
    {
        return Label("Restore", name);
    }

    /// <summary>Moving an item or folder to another parent, position or area.</summary>
    public static string Move(string name)
    {
        return Label("Move", name);
    }

    /// <summary>Indenting an item under its previous sibling.</summary>
    public static string Indent(string name)
    {
        return Label("Indent", name);
    }

    /// <summary>Outdenting an item to its parent's level.</summary>
    public static string Outdent(string name)
    {
        return Label("Outdent", name);
    }

    /// <summary>Changing the order of sibling items.</summary>
    public static string ReorderItems()
    {
        return "Reorder items";
    }

    /// <summary>Changing the order of sibling folders.</summary>
    public static string ReorderFolders()
    {
        return "Reorder folders";
    }

    /// <summary>Moving a due date or scheduled block on the calendar.</summary>
    public static string Reschedule(string name)
    {
        return Label("Reschedule", name);
    }

    /// <summary>Renaming a folder or project.</summary>
    public static string Rename(string name)
    {
        return Label("Rename", name);
    }

    /// <summary>Moving one item's floating dates one day later.</summary>
    public static string PushBack(string name) => Label("Push back", name);

    /// <summary>Setting an item's status from a row menu or the editor, with any completion it causes.</summary>
    public static string SetStatus(string name) => Label("Set status of", name);

    /// <summary>Setting an item's priority from a row menu.</summary>
    public static string SetPriority(string name) => Label("Set priority of", name);

    public static string AddStatus(string name) => Label("Add status", name);

    public static string RenameStatus(string name) => Label("Rename status", name);

    public static string ArchiveStatus(string name) => Label("Archive status", name);

    public static string RestoreStatus(string name) => Label("Restore status", name);

    public static string ReorderStatuses() => "Reorder statuses";

    public static string AddPriority(string name) => Label("Add priority", name);

    public static string SetPriorityNumber(string name) => Label("Edit priority", name);

    public static string AddItemType(string name) => Label("Add item type", name);

    public static string RenameItemType(string name) => Label("Rename item type", name);

    public static string ArchiveItemType(string name) => Label("Archive item type", name);

    public static string RestoreItemType(string name) => Label("Restore item type", name);

    public static string RenamePriority(string name) => Label("Rename priority", name);

    public static string ArchivePriority(string name) => Label("Archive priority", name);

    public static string RestorePriority(string name) => Label("Restore priority", name);

    public static string AddField(string name) => Label("Add field", name);

    public static string RenameField(string name) => Label("Rename field", name);

    public static string ChangeFieldType(string name) => Label("Change type of field", name);

    public static string ArchiveField(string name) => Label("Archive field", name);

    public static string RestoreField(string name) => Label("Restore field", name);

    public static string AddChoice(string name) => Label("Add choice", name);

    public static string RenameChoice(string name) => Label("Rename choice", name);

    public static string ArchiveChoice(string name) => Label("Archive choice", name);

    public static string RestoreChoice(string name) => Label("Restore choice", name);

    public static string SaveSearch(string name) => Label("Save search", name);

    public static string ReplaceSearch(string name) => Label("Replace saved search", name);

    public static string RenameSearch(string name) => Label("Rename saved search", name);

    public static string DeleteSearch(string name) => Label("Delete saved search", name);

    public static string ReorderProjects() => "Reorder projects";

    public static string ReorderItemTypes() => "Reorder item types";

    public static string ReorderPriorities() => "Reorder priority levels";

    public static string ReorderFields() => "Reorder fields";

    public static string ReorderChoices() => "Reorder choices";

    public static string ReorderSearches() => "Reorder saved searches";

    public static string EditGlobalSettings() => "Edit global settings";

    public static string EditProjectSettings() => "Edit project settings";

    private static string Label(string verb, string name)
    {
        return $"{verb} '{name}'";
    }
}