namespace TaskTracker.App.Desktop.Installation;

/// <summary>A thin wrapper over the per-user Windows <c>Run</c> registry key, so tests can use a fake.</summary>
internal interface IRunKey
{
    /// <summary>Creates or replaces a value.</summary>
    void SetValue(string name, string command);

    /// <summary>Deletes a value; does nothing if it is missing.</summary>
    void DeleteValue(string name);
}