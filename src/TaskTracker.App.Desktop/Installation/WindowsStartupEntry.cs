namespace TaskTracker.App.Desktop.Installation;

/// <summary>Starts the installed app at sign-in through the per-user <c>Run</c> key (§7.13).</summary>
internal sealed class WindowsStartupEntry : IStartupEntry
{
    /// <summary>The value name under the <c>Run</c> key.</summary>
    public const string ValueName = "TaskTracker";

    private readonly IRunKey runKey;
    private readonly string executablePath;

    /// <param name="runKey">The registry key to write.</param>
    /// <param name="executablePath">The installed executable, which Velopack keeps at a stable path across updates.</param>
    public WindowsStartupEntry(IRunKey runKey, string executablePath)
    {
        this.runKey = runKey;
        this.executablePath = executablePath;
    }

    /// <inheritdoc />
    public void Write()
    {
        runKey.SetValue(ValueName, $"\"{executablePath}\"");
    }

    /// <inheritdoc />
    public void Remove()
    {
        runKey.DeleteValue(ValueName);
    }
}