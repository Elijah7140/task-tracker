using TaskTracker.App.Desktop.Installation;

namespace TaskTracker.App.Desktop.Tests.Installation;

/// <summary>Writes real autostart files into a temporary configuration folder.</summary>
public sealed class LinuxStartupEntryTests : IDisposable
{
    private readonly string configDirectory =
        Path.Combine(Path.GetTempPath(), $"tasktracker-autostart-{Guid.CreateVersion7()}");

    public void Dispose()
    {
        if (Directory.Exists(configDirectory))
        {
            Directory.Delete(configDirectory, recursive: true);
        }
    }

    [Fact]
    public void Writing_creates_the_autostart_folder_and_desktop_file()
    {
        var entry = new LinuxStartupEntry(configDirectory, "/home/alex/Apps/TaskTracker.AppImage");

        entry.Write();

        var expectedPath = Path.Combine(configDirectory, "autostart", "task-tracker.desktop");
        Assert.Equal(expectedPath, entry.FilePath);
        var lines = File.ReadAllLines(expectedPath);
        Assert.Equal("[Desktop Entry]", lines[0]);
        Assert.Contains("Type=Application", lines);
        Assert.Contains("Name=Task Tracker", lines);
        Assert.Contains("Exec=\"/home/alex/Apps/TaskTracker.AppImage\"", lines);
    }

    [Fact]
    public void Special_characters_in_the_path_are_escaped_for_the_exec_key()
    {
        var entry = new LinuxStartupEntry(configDirectory, @"/home/alex/My $Apps/100%/Task""Tracker`\.AppImage");

        entry.Write();

        var lines = File.ReadAllLines(entry.FilePath);
        Assert.Contains(@"Exec=""/home/alex/My \$Apps/100%%/Task\""Tracker\`\\\\.AppImage""", lines);
    }

    [Fact]
    public void Removing_deletes_the_desktop_file()
    {
        var entry = new LinuxStartupEntry(configDirectory, "/opt/TaskTracker.AppImage");
        entry.Write();

        entry.Remove();

        Assert.False(File.Exists(entry.FilePath));
    }

    [Fact]
    public void Removing_when_nothing_was_written_does_nothing()
    {
        var entry = new LinuxStartupEntry(configDirectory, "/opt/TaskTracker.AppImage");

        entry.Remove();

        Assert.False(Directory.Exists(configDirectory));
    }

    [Fact]
    public void An_absolute_xdg_config_home_is_honoured()
    {
        var resolved = LinuxStartupEntry.ResolveConfigDirectory(configDirectory, "/home/alex");

        Assert.Equal(configDirectory, resolved);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("relative/config")]
    public void Without_a_usable_xdg_config_home_the_home_config_folder_is_used(string? xdgConfigHome)
    {
        var home = Path.Combine(configDirectory, "home");

        var resolved = LinuxStartupEntry.ResolveConfigDirectory(xdgConfigHome, home);

        Assert.Equal(Path.Combine(home, ".config"), resolved);
    }
}