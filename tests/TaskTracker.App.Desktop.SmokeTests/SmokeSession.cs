using System.Diagnostics;

using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Capturing;
using FlaUI.Core.Input;
using FlaUI.Core.Tools;
using FlaUI.Core.WindowsAPI;
using FlaUI.UIA3;

namespace TaskTracker.App.Desktop.SmokeTests;

/// <summary>Runs one desktop application against an isolated SQLite file.</summary>
public sealed class SmokeSession : IDisposable
{
    private readonly Application application;
    private readonly UIA3Automation automation;
    private readonly string databasePath;
    private readonly Process process;

    /// <summary>Starts the app with a fresh database and waits for its main window.</summary>
    public SmokeSession()
    {
        databasePath = Path.Combine(Path.GetTempPath(), $"tasktracker-smoke-{Guid.NewGuid():N}.db");
        Application? startedApplication = null;
        Process? startedProcess = null;
        UIA3Automation? startedAutomation = null;
        Window? openedWindow = null;

        try
        {
            var startInfo = new ProcessStartInfo(FindExecutable());
            startInfo.Environment["TASKTRACKER_DB_PATH"] = databasePath;
            startedApplication = Application.Launch(startInfo);
            startedProcess = Process.GetProcessById(startedApplication.ProcessId);
            startedAutomation = new UIA3Automation();
            openedWindow = startedApplication.GetMainWindow(startedAutomation, TimeSpan.FromSeconds(15))
                ?? throw new InvalidOperationException("The main window did not open.");
        }
        catch
        {
            SaveScreenshot(openedWindow);
            CleanupFailedStartup(startedProcess, startedApplication, startedAutomation);
            throw;
        }

        application = startedApplication;
        process = startedProcess;
        automation = startedAutomation;
        Window = openedWindow;
    }

    /// <summary>The application's main window.</summary>
    public Window Window { get; }

    /// <summary>Finds a control in this process, including its modal windows and menus.</summary>
    public AutomationElement Find(string automationId)
    {
        return Retry.WhileNull(
            () => FindNow(automationId),
            TimeSpan.FromSeconds(10)).Result
            ?? throw new InvalidOperationException($"Control {automationId} was not found.");
    }

    /// <summary>Finds a repeated control by its ID and displayed name.</summary>
    public AutomationElement FindNamed(string automationId, string name)
    {
        return Retry.WhileNull(
            () => Window.FindAllDescendants(query => query.ByAutomationId(automationId))
                .FirstOrDefault(element => element.Name == name || element.FindFirstDescendant(
                    query => query.ByName(name)) is not null),
            TimeSpan.FromSeconds(10)).Result
            ?? throw new InvalidOperationException($"Control {automationId} named {name} was not found.");
    }

    /// <summary>Finds displayed text in the main window.</summary>
    public AutomationElement FindText(string name)
    {
        return Retry.WhileNull(
            () => Window.FindFirstDescendant(query => query.ByName(name)),
            TimeSpan.FromSeconds(10)).Result
            ?? throw new InvalidOperationException($"Text {name} was not found.");
    }

    /// <summary>Checks whether text is currently displayed in the main window, without waiting.</summary>
    public bool HasText(string name)
    {
        return Window.FindFirstDescendant(query => query.ByName(name)) is not null;
    }

    /// <summary>Picks the entry of a combo box whose displayed text matches the name.</summary>
    public void SelectByName(string automationId, string entryName)
    {
        var comboBox = Find(automationId).AsComboBox();
        comboBox.Select(entryName);
        WaitUntil(() => comboBox.SelectedItem?.Name == entryName, $"{automationId} to show {entryName}");
    }

    /// <summary>
    /// Types into a text box and checks the result. Desktop notifications can steal focus
    /// mid-typing, so a box whose text doesn't match is cleared and typed again.
    /// </summary>
    public void TypeInto(string automationId, string value)
    {
        var box = Find(automationId).AsTextBox();
        var typed = Retry.WhileFalse(() => TryType(box, value), TimeSpan.FromSeconds(10)).Result;

        if (!typed)
        {
            throw new InvalidOperationException($"Could not type '{value}' into {automationId}.");
        }
    }

    private static bool TryType(TextBox box, string value)
    {
        box.Focus();
        Keyboard.TypeSimultaneously(VirtualKeyShort.CONTROL, VirtualKeyShort.KEY_A);
        Keyboard.Type(VirtualKeyShort.DELETE);
        Keyboard.Type(value);
        Wait.UntilInputIsProcessed();
        return box.Text == value;
    }

    /// <summary>Sends a complete key press and release.</summary>
    public void Press(VirtualKeyShort key)
    {
        Keyboard.Type(key);
    }

    /// <summary>Types a chord and releases every held modifier even when input fails.</summary>
    public void TypeChord(params VirtualKeyShort[] keys)
    {
        if (keys.Length < 2)
        {
            throw new ArgumentException("A chord needs a modifier and a key.", nameof(keys));
        }

        var pressed = new List<VirtualKeyShort>();

        try
        {
            foreach (var modifier in keys[..^1])
            {
                Keyboard.Press(modifier);
                pressed.Add(modifier);
            }

            Keyboard.Type(keys[^1]);
        }
        finally
        {
            for (var index = pressed.Count - 1; index >= 0; index--)
            {
                Keyboard.Release(pressed[index]);
            }
        }
    }

    /// <summary>Finds the checkbox in the same item row as the named title.</summary>
    public CheckBox FindRowCheckbox(string title)
    {
        var row = FindNamed("ItemTitleButton", title).Parent;

        while (row is not null)
        {
            var checkbox = row.FindFirstDescendant(query => query.ByAutomationId("ItemCompleteCheckBox"));

            if (checkbox is not null)
            {
                return checkbox.AsCheckBox();
            }

            row = row.Parent;
        }

        throw new InvalidOperationException($"Checkbox for {title} was not found.");
    }

    /// <summary>Waits until the supplied UI condition becomes true.</summary>
    public void WaitUntil(Func<bool> condition, string description)
    {
        if (!Retry.WhileFalse(condition, TimeSpan.FromSeconds(10)).Success)
        {
            throw new InvalidOperationException($"Timed out waiting for {description}.");
        }
    }

    /// <summary>Checks whether a control currently exists in this process.</summary>
    public bool HasControl(string automationId)
    {
        return FindNow(automationId) is not null;
    }

    /// <summary>Saves an image of the application window for a failed scenario.</summary>
    public void SaveFailureScreenshot()
    {
        SaveScreenshot(Window);
    }

    /// <summary>Closes the application and removes its isolated database.</summary>
    public void Dispose()
    {
        StopProcess(process, application);
        process.Dispose();
        automation.Dispose();
        application.Dispose();
        DeleteDatabase();
    }

    private AutomationElement? FindNow(string automationId)
    {
        var mainControl = Window.FindFirstDescendant(query => query.ByAutomationId(automationId));

        if (mainControl is not null)
        {
            return mainControl;
        }

        // Modal windows and context menus are separate top-level windows in UI Automation.
        return application.GetAllTopLevelWindows(automation)
            .Where(window => window.Properties.ProcessId.Value == application.ProcessId)
            .Select(window => window.FindFirstDescendant(query => query.ByAutomationId(automationId)))
            .FirstOrDefault(control => control is not null);
    }

    private static void StopProcess(Process? startedProcess, Application? startedApplication)
    {
        try
        {
            startedApplication?.Close();
        }
        catch (InvalidOperationException)
        {
            // The application may have exited before cleanup starts.
        }

        if (startedProcess is null)
        {
            return;
        }

        if (!startedProcess.WaitForExit(10000))
        {
            startedProcess.Kill(entireProcessTree: true);
            startedProcess.WaitForExit(10000);
        }
    }

    private void CleanupFailedStartup(Process? startedProcess, Application? startedApplication,
        UIA3Automation? startedAutomation)
    {
        if (startedProcess is not null)
        {
            TryCleanup(() =>
            {
                if (!startedProcess.HasExited)
                {
                    startedProcess.Kill(entireProcessTree: true);
                    startedProcess.WaitForExit(10000);
                }
            });
        }

        TryCleanup(() => startedProcess?.Dispose());
        TryCleanup(() => startedAutomation?.Dispose());
        TryCleanup(() => startedApplication?.Dispose());
        TryCleanup(DeleteDatabase);
    }

    private static void TryCleanup(Action cleanup)
    {
        try
        {
            cleanup();
        }
        catch
        {
            // Preserve the startup exception after attempting every cleanup step.
        }
    }

    private static void SaveScreenshot(Window? window)
    {
        try
        {
            var directory = Path.Combine(AppContext.BaseDirectory, "Failures");
            Directory.CreateDirectory(directory);
            var path = Path.Combine(directory, $"smoke-{Guid.NewGuid():N}.png");
            var capture = window is null ? Capture.Screen() : Capture.Element(window);
            capture.ToFile(path);
        }
        catch
        {
            // Screenshot capture must not replace the original test failure.
        }
    }

    private void DeleteDatabase()
    {
        if (File.Exists(databasePath))
        {
            File.Delete(databasePath);
        }
    }

    private static string FindExecutable()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        var configuration = directory.Parent?.Name ?? "Debug";

        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "TaskTracker.slnx")))
        {
            directory = directory.Parent;
        }

        if (directory is null)
        {
            throw new DirectoryNotFoundException("Solution root was not found.");
        }

        return Path.Combine(directory.FullName, "src", "TaskTracker.App.Desktop", "bin",
            configuration, "net10.0", "TaskTracker.App.Desktop.exe");
    }
}