using System.Text;

namespace TaskTracker.App.Desktop.Installation;

/// <summary>
/// Starts the AppImage at sign-in through an XDG autostart file,
/// <c>$XDG_CONFIG_HOME/autostart/task-tracker.desktop</c> (§7.13).
/// </summary>
internal sealed class LinuxStartupEntry : IStartupEntry
{
    /// <summary>The autostart file name.</summary>
    public const string FileName = "task-tracker.desktop";

    private readonly string configDirectory;
    private readonly string executablePath;

    /// <param name="configDirectory">The user's configuration folder; see <see cref="ResolveConfigDirectory"/>.</param>
    /// <param name="executablePath">The AppImage file to start.</param>
    public LinuxStartupEntry(string configDirectory, string executablePath)
    {
        this.configDirectory = configDirectory;
        this.executablePath = executablePath;
    }

    /// <summary>The autostart file this entry writes.</summary>
    public string FilePath => Path.Combine(configDirectory, "autostart", FileName);

    /// <summary>
    /// <c>XDG_CONFIG_HOME</c> when it holds an absolute path, as the XDG base directory
    /// specification requires; otherwise <c>~/.config</c>.
    /// </summary>
    public static string ResolveConfigDirectory(string? xdgConfigHome, string homeDirectory)
    {
        if (!string.IsNullOrEmpty(xdgConfigHome) && Path.IsPathRooted(xdgConfigHome))
        {
            return xdgConfigHome;
        }

        return Path.Combine(homeDirectory, ".config");
    }

    /// <inheritdoc />
    public void Write()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        File.WriteAllText(FilePath, DesktopFileText());
    }

    /// <inheritdoc />
    public void Remove()
    {
        if (File.Exists(FilePath))
        {
            File.Delete(FilePath);
        }
    }

    private string DesktopFileText()
    {
        var text = new StringBuilder();
        text.Append("[Desktop Entry]\n");
        text.Append("Type=Application\n");
        text.Append("Name=Task Tracker\n");
        text.Append($"Exec={QuoteExecArgument(executablePath)}\n");
        text.Append("Terminal=false\n");
        text.Append("X-GNOME-Autostart-enabled=true\n");

        return text.ToString();
    }

    /// <summary>
    /// Quotes a path for the <c>Exec</c> key. Inside quotes, the desktop entry specification escapes
    /// <c>"</c>, <c>`</c> and <c>$</c> with a backslash, writes a backslash as four, and doubles <c>%</c>.
    /// </summary>
    private static string QuoteExecArgument(string path)
    {
        var quoted = new StringBuilder("\"");
        foreach (var character in path)
        {
            quoted.Append(EscapeExecCharacter(character));
        }

        return quoted.Append('"').ToString();
    }

    private static string EscapeExecCharacter(char character)
    {
        return character switch
        {
            '"' or '`' or '$' => $"\\{character}",
            '\\' => @"\\\\",
            '%' => "%%",
            _ => character.ToString(),
        };
    }
}