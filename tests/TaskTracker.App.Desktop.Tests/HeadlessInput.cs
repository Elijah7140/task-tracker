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

    /// <summary>The window position of a point inside a control, measured from the control's top-left corner.</summary>
    public static Point PointIn(Window window, Control control, double x, double y)
    {
        return control.TranslatePoint(new Point(x, y), window)!.Value;
    }

    /// <summary>The window position of a control's centre.</summary>
    public static Point CentreOf(Window window, Control control)
    {
        return PointIn(window, control, control.Bounds.Width / 2, control.Bounds.Height / 2);
    }

    /// <summary>Presses a mouse button (the left one by default) at a window position without releasing it.</summary>
    public static void PressMouse(Window window, Point point, MouseButton button = MouseButton.Left,
        RawInputModifiers held = RawInputModifiers.None)
    {
        window.MouseDown(point, button, held);
        Dispatcher.UIThread.RunJobs();
    }

    /// <summary>Moves the mouse to a window position; by default the left button counts as held down.</summary>
    public static void MoveMouse(Window window, Point point,
        RawInputModifiers held = RawInputModifiers.LeftMouseButton)
    {
        window.MouseMove(point, held);
        Dispatcher.UIThread.RunJobs();
    }

    /// <summary>Releases a mouse button (the left one by default) at a window position.</summary>
    public static void ReleaseMouse(Window window, Point point, MouseButton button = MouseButton.Left,
        RawInputModifiers held = RawInputModifiers.None)
    {
        window.MouseUp(point, button, held);
        Dispatcher.UIThread.RunJobs();
    }

    /// <summary>Turns the mouse wheel at a window position; by default the left button counts as held down.</summary>
    public static void Wheel(Window window, Point point, double deltaY,
        RawInputModifiers held = RawInputModifiers.LeftMouseButton)
    {
        window.MouseWheel(point, new Vector(0, deltaY), held);
        Dispatcher.UIThread.RunJobs();
    }

    /// <summary>Presses at one position, moves in several steps, and releases at another.</summary>
    public static void Drag(Window window, Point from, Point to)
    {
        const int steps = 5;
        PressMouse(window, from);

        for (var step = 1; step <= steps; step++)
        {
            var fraction = (double)step / steps;
            MoveMouse(window, from + (to - from) * fraction);
        }

        ReleaseMouse(window, to);
    }

    /// <summary>Lets background work finish, pumping the UI thread, until the condition holds.</summary>
    public static async Task WaitUntilAsync(Func<bool> condition)
    {
        for (var attempt = 0; attempt < 300 && !condition(); attempt++)
        {
            await Task.Delay(10);
            Dispatcher.UIThread.RunJobs();
        }

        Assert.True(condition(), "The condition was not met in time.");
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