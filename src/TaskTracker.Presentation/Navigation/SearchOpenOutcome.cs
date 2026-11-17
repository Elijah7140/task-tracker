namespace TaskTracker.Presentation.Navigation;

/// <summary>What happened when a search result was activated.</summary>
public enum SearchOpenOutcome
{
    /// <summary>The item's project is now open.</summary>
    Opened,

    /// <summary>The user declined to leave a page with unsaved changes.</summary>
    Cancelled,

    /// <summary>The item was deleted, or its project is gone.</summary>
    ItemMissing
}