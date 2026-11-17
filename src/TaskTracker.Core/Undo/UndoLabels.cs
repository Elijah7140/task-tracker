namespace TaskTracker.Core.Undo;

/// <summary>
/// The names of undoable user actions, such as "Complete 'Write report'". A service records an
/// action by passing one of these to <c>IUnitOfWork.SaveChangesAsync</c>; a save without a label is
/// never recorded. Search the services for <c>UndoLabels.</c> to see everything that can be undone.
/// </summary>
public static class UndoLabels
{
    public static string SetRecurrence(string title) => $"Set repeat for '{title}'";

    public static string SkipRepeat(string title) => $"Skip repeat for '{title}'";

    public static string StopRepeating(string title) => $"Stop repeating '{title}'";

    /// <summary>Creating an item or sub-item.</summary>
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

    private static string Label(string verb, string name)
    {
        return $"{verb} '{name}'";
    }
}