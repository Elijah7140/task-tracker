namespace TaskTracker.App.Desktop.Installation;

/// <summary>One operating system's entry that starts the app when the user signs in.</summary>
internal interface IStartupEntry
{
    /// <summary>Creates or replaces the entry.</summary>
    void Write();

    /// <summary>Deletes the entry if it exists.</summary>
    void Remove();
}