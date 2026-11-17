using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Simulated mouse and keyboard input, and lookups by AutomationId, for headless view tests.</summary>
public static class HeadlessInput
{
    /// <summary>Scrolls the control into view and clicks its centre with the left mouse button.</summary>
    public static void Click(Window window, Control control)
    {
        control.BringIntoView();
        Dispatcher.UIThread.RunJobs();
        var centre = new Point(control.Bounds.Width / 2, control.Bounds.Height / 2);
        var point = control.TranslatePoint(centre, window)!.Value;
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);
        Dispatcher.UIThread.RunJobs();
    }

    /// <summary>Clicks a text box to focus it, then types the text.</summary>
    public static void TypeInto(Window window, Control textBox, string text)
    {
        Click(window, textBox);
        window.KeyTextInput(text);
        Dispatcher.UIThread.RunJobs();
    }

    /// <summary>Presses and releases one key.</summary>
    public static void Press(TopLevel target, Key key, RawInputModifiers modifiers = RawInputModifiers.None)
    {
        target.KeyPress(key, modifiers, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
    }

    /// <summary>Focuses a combo box with a click and picks an entry using the Escape and arrow keys.</summary>
    public static void ChooseEntry(Window window, ComboBox comboBox, int downPresses)
    {
        Click(window, comboBox);
        Press(window, Key.Escape);

        for (var press = 0; press < downPresses; press++)
        {
            Press(window, Key.Down);
        }
    }

    /// <summary>Opens a combo box with a click and clicks the entry whose displayed text matches.</summary>
    public static void ChooseItem(Window window, ComboBox comboBox, string itemText)
    {
        Click(window, comboBox);
        var item = window.GetVisualDescendants()
            .OfType<ComboBoxItem>()
            .First(candidate => candidate.IsEffectivelyVisible && DisplayedText(candidate) == itemText);
        Click(window, item);
    }

    /// <summary>The text a combo box entry shows, whether its content is a string or a templated object.</summary>
    private static string? DisplayedText(ComboBoxItem item)
    {
        var shown = item.GetVisualDescendants().OfType<TextBlock>().FirstOrDefault();
        return shown?.Text ?? item.Content?.ToString();
    }

    /// <summary>Returns the visible controls of a type with the given AutomationId.</summary>
    public static List<T> FindAll<T>(Visual root, string automationId)
        where T : Control
    {
        return root.GetVisualDescendants()
            .OfType<T>()
            .Where(control => AutomationProperties.GetAutomationId(control) == automationId)
            .Where(control => control.IsEffectivelyVisible)
            .ToList();
    }

    /// <summary>Returns the single visible control with the given AutomationId.</summary>
    public static T Find<T>(Visual root, string automationId)
        where T : Control
    {
        return Assert.Single(FindAll<T>(root, automationId));
    }

    /// <summary>Returns the visible control with the given AutomationId whose automation name matches.</summary>
    public static T FindNamed<T>(Visual root, string automationId, string automationName)
        where T : Control
    {
        return Assert.Single(FindAll<T>(root, automationId),
            control => AutomationProperties.GetName(control) == automationName);
    }
}