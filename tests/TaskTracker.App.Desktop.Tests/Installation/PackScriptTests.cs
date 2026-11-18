using System.Text.RegularExpressions;

using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.App.Desktop.Tests.Installation;

/// <summary>
/// Guards the pack scripts. Velopack installs to <c>%LocalAppData%\&lt;packId&gt;</c> and deletes that
/// folder on uninstall, so the pack id must never be the database folder's name (§7.13).
/// </summary>
public sealed partial class PackScriptTests
{
    [Theory]
    [InlineData("pack.ps1")]
    [InlineData("pack.sh")]
    public void The_install_folder_is_never_the_data_folder(string scriptName)
    {
        var script = File.ReadAllText(Path.Combine(RepositoryRoot(), "scripts", scriptName));

        var packId = PackIdAssignment().Match(script).Groups["id"].Value;

        var dataFolderName = Path.GetFileName(Path.GetDirectoryName(DatabaseInitializer.DefaultPath));
        Assert.Equal("TaskTrackerApp", packId);
        Assert.NotEqual(dataFolderName, packId, StringComparer.OrdinalIgnoreCase);
    }

    private static string RepositoryRoot()
    {
        var folder = new DirectoryInfo(AppContext.BaseDirectory);
        while (folder is not null && !File.Exists(Path.Combine(folder.FullName, "TaskTracker.slnx")))
        {
            folder = folder.Parent;
        }

        return folder?.FullName ?? throw new InvalidOperationException("The repository root was not found.");
    }

    /// <summary>Matches <c>$packId = 'X'</c> in PowerShell and <c>pack_id="X"</c> in bash.</summary>
    [GeneratedRegex("""^\$?pack_?[iI]d\s*=\s*['"](?<id>[^'"]+)['"]""", RegexOptions.Multiline)]
    private static partial Regex PackIdAssignment();
}