using System.Diagnostics;
using System.Text.RegularExpressions;

using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.App.Desktop.Tests.Installation;

/// <summary>
/// Guards the pack scripts. Velopack installs to <c>%LocalAppData%\&lt;packId&gt;</c> and deletes that
/// folder on uninstall, so the pack id must never be the database folder's name (§7.13).
/// </summary>
public sealed partial class PackScriptTests : IDisposable
{
    private readonly DirectoryInfo sandbox = Directory.CreateTempSubdirectory("tasktracker-pack-");

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
        var argument = scriptName == "pack.ps1" ? "'--packId', $packId," : "--packId \"$pack_id\"";
        Assert.Contains(argument, script, StringComparison.Ordinal);
        Assert.Single(PackIdOption().Matches(script));
    }

    [Fact]
    public async Task An_invalid_runtime_is_rejected_before_any_cleanup()
    {
        var script = CopyNativePackScript();
        Directory.CreateDirectory(Path.Combine(sandbox.FullName, "artifacts", "publish"));
        Directory.CreateDirectory(Path.Combine(sandbox.FullName, "artifacts", "releases"));
        var sentinel = Directory.CreateDirectory(Path.Combine(sandbox.FullName, "keep")).FullName;
        var file = Path.Combine(sentinel, "original.txt");
        File.WriteAllText(file, "keep");

        var result = await RunScriptAsync(script, "../../keep");

        Assert.NotEqual(0, result.ExitCode);
        Assert.Equal("keep", File.ReadAllText(file));
        Assert.Contains("Unsupported runtime", result.Output, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Packaging_from_another_directory_runs_dotnet_in_the_repo_root_with_the_feed_override()
    {
        var script = CopyNativePackScript();
        const string feed = "https://github.com/example/task-tracker-releases";

        var result = await RunScriptAsync(script, "win-x64", feed);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Contains("publish|", result.Output, StringComparison.Ordinal);
        Assert.Contains($"-p:TaskTrackerUpdateFeedUrl={feed}", result.Output, StringComparison.Ordinal);
        Assert.Contains("tool|restore", result.Output, StringComparison.Ordinal);
        Assert.Contains("vpk|pack|--packId|TaskTrackerApp|", result.Output, StringComparison.Ordinal);
    }

    private string CopyNativePackScript()
    {
        var name = OperatingSystem.IsWindows() ? "pack.ps1" : "pack.sh";
        var folder = Directory.CreateDirectory(Path.Combine(sandbox.FullName, "scripts"));
        var copy = Path.Combine(folder.FullName, name);
        File.Copy(Path.Combine(RepositoryRoot(), "scripts", name), copy);
        return copy;
    }

    private async Task<(int ExitCode, string Output)> RunScriptAsync(string script, string runtime, string feed = "")
    {
        var start = OperatingSystem.IsWindows() ? WindowsStub() : BashStub();
        start.WorkingDirectory = Directory.CreateDirectory(Path.Combine(sandbox.FullName, "caller")).FullName;
        start.Environment["PACK_TEST_ROOT"] = sandbox.FullName;
        start.Environment["PACK_TEST_SCRIPT"] = script;
        start.Environment["PACK_TEST_RUNTIME"] = runtime;
        start.Environment["PACK_TEST_FEED"] = feed;
        start.RedirectStandardOutput = true;
        start.RedirectStandardError = true;
        using var process = Process.Start(start)!;
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        return (process.ExitCode, (await output) + (await error));
    }

    private static ProcessStartInfo WindowsStub()
    {
        return new ProcessStartInfo("powershell.exe")
        {
            ArgumentList =
            {
                "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
                """
                $ErrorActionPreference = 'Stop'
                function dotnet {
                    if ((Get-Location).ProviderPath -ne $env:PACK_TEST_ROOT) { throw 'dotnet ran outside the repo root' }
                    $global:LASTEXITCODE = 0
                    $args -join '|'
                }
                & $env:PACK_TEST_SCRIPT -Runtime $env:PACK_TEST_RUNTIME -Version '0.1.0' -UpdateFeedUrl $env:PACK_TEST_FEED
                """,
            },
        };
    }

    private static ProcessStartInfo BashStub()
    {
        return new ProcessStartInfo("bash")
        {
            ArgumentList =
            {
                "-c",
                """
                dotnet() {
                  if [[ "$(pwd -P)" != "$(cd "$PACK_TEST_ROOT" && pwd -P)" ]]; then
                    echo 'dotnet ran outside the repo root' >&2
                    return 1
                  fi
                  (IFS='|'; echo "$*")
                }
                export -f dotnet
                bash "$PACK_TEST_SCRIPT" "$PACK_TEST_RUNTIME" 0.1.0 "$PACK_TEST_FEED"
                """,
            },
        };
    }

    public void Dispose()
    {
        sandbox.Delete(recursive: true);
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

    [GeneratedRegex("--packId")]
    private static partial Regex PackIdOption();
}