using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Layout;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Dialogs;

/// <summary>Shows modal input and message windows owned by the main window.</summary>
public sealed class AvaloniaDialogService : IDialogService
{
    private readonly Window? owner;

    /// <summary>Uses the supplied owner for dialogs, or the desktop main window.</summary>
    public AvaloniaDialogService(Window? owner = null)
    {
        this.owner = owner;
    }

    public async Task<string?> PromptAsync(string title, string label, string? initialValue = null)
    {
        var input = new TextBox { Text = initialValue ?? string.Empty, MinWidth = 320 };
        AutomationProperties.SetAutomationId(input, "DialogInput");
        var validation = new TextBlock { Foreground = Avalonia.Media.Brushes.IndianRed };
        var window = CreateWindow(title, new TextBlock { Text = label }, input, validation);
        var save = AddButtons(window, "Save", () => window.Close(input.Text?.Trim()), "Cancel", () => window.Close(null));
        input.TextChanged += (_, _) => ValidateName(input, validation, save);
        ValidateName(input, validation, save);
        window.Opened += (_, _) =>
        {
            input.Focus();
            if (initialValue is not null)
            {
                input.SelectAll();
            }
        };
        return await window.ShowDialog<string?>(GetOwner());
    }

    public async Task<bool> ConfirmAsync(string title, string message, string confirmText = "Continue",
        bool cancelIsDefault = false)
    {
        var window = CreateWindow(title, new TextBlock { Text = message, TextWrapping = Avalonia.Media.TextWrapping.Wrap });
        var confirm = AddButtons(window, confirmText, () => window.Close(true), "Cancel", () => window.Close(false));
        var cancel = (Button)((StackPanel)((StackPanel)window.Content!).Children[^1]).Children[1];
        var focused = cancelIsDefault ? cancel : confirm;
        confirm.IsDefault = !cancelIsDefault;
        cancel.IsDefault = cancelIsDefault;
        window.Opened += (_, _) => focused.Focus();
        return await window.ShowDialog<bool>(GetOwner());
    }

    public async Task<DraftDecision> ResolveDraftAsync()
    {
        var window = CreateWindow("Unsaved changes", new TextBlock { Text = "Save changes before continuing?" });
        var panel = (StackPanel)window.Content!;
        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right
        };

        foreach (var choice in new[] { DraftDecision.Save, DraftDecision.Discard, DraftDecision.Cancel })
        {
            var button = new Button
            {
                Content = choice.ToString(),
                MinWidth = 80,
                IsDefault = choice == DraftDecision.Save,
                IsCancel = choice == DraftDecision.Cancel
            };
            button.Click += (_, _) => window.Close(choice);
            AutomationProperties.SetAutomationId(button, $"Draft{choice}Button");
            buttons.Children.Add(button);
        }

        panel.Children.Add(buttons);
        return await window.ShowDialog<DraftDecision>(GetOwner());
    }

    public async Task<FolderChoice?> PickFolderAsync(string title, IReadOnlyList<FolderChoice> folders,
        string label = "Move into", string confirmText = "Move")
    {
        var picker = new ComboBox
        {
            ItemsSource = folders,
            SelectedIndex = 0,
            MinWidth = 320,
            ItemTemplate = new Avalonia.Controls.Templates.FuncDataTemplate<FolderChoice>((choice, _) =>
                new TextBlock { Text = new string(' ', choice.Depth * 3) + choice.Name })
        };
        AutomationProperties.SetAutomationId(picker, "DialogFolderPicker");
        var window = CreateWindow(title, new TextBlock { Text = label }, picker);
        AddButtons(window, confirmText, () => window.Close(picker.SelectedItem as FolderChoice),
            "Cancel", () => window.Close(null));
        return await window.ShowDialog<FolderChoice?>(GetOwner());
    }

    public async Task<int?> ChooseAsync(string title, string label, IReadOnlyList<string> options,
        string confirmText = "Choose")
    {
        var picker = new ComboBox { ItemsSource = options, SelectedIndex = 0, MinWidth = 320 };
        AutomationProperties.SetAutomationId(picker, "DialogChoicePicker");
        var window = CreateWindow(title, new TextBlock { Text = label }, picker);
        AddButtons(window, confirmText, () => window.Close(picker.SelectedIndex), "Cancel", () => window.Close(null));

        return await window.ShowDialog<int?>(GetOwner());
    }

    public async Task<bool> ShowImportPreviewAsync(CsvImportPreviewViewModel preview)
    {
        var content = new ScrollViewer
        {
            Content = new ImportPreviewView { DataContext = preview },
            MaxHeight = 560,
            HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled
        };
        var window = CreateWindow("Import CSV", 720, content);

        if (preview.CanImport)
        {
            AddButtons(window, "Import", () => window.Close(true), "Cancel", () => window.Close(false));
        }
        else
        {
            var close = AddButtons(window, "Close", () => window.Close(false), null, null);
            close.IsCancel = true;
        }

        return await window.ShowDialog<bool>(GetOwner());
    }

    public async Task ShowMessageAsync(string title, string message)
    {
        var window = CreateWindow(title, new TextBlock { Text = message, TextWrapping = Avalonia.Media.TextWrapping.Wrap });
        var button = AddButtons(window, "OK", () => window.Close(), null, null);
        button.IsCancel = true;
        await window.ShowDialog(GetOwner());
    }

    private static Window CreateWindow(string title, params Control[] content)
    {
        return CreateWindow(title, 420, content);
    }

    private static Window CreateWindow(string title, double width, params Control[] content)
    {
        var panel = new StackPanel { Spacing = 16, Margin = new Thickness(24) };

        foreach (var control in content)
        {
            panel.Children.Add(control);
        }

        return new Window
        {
            Title = title,
            Width = width,
            SizeToContent = SizeToContent.Height,
            MinHeight = 150,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Content = panel
        };
    }

    private static Button AddButtons(Window window, string primaryText, Action primaryAction,
        string? secondaryText, Action? secondaryAction)
    {
        var panel = (StackPanel)window.Content!;
        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right
        };
        var primary = new Button { Content = primaryText, MinWidth = 80, IsDefault = true };
        AutomationProperties.SetAutomationId(primary, "DialogConfirmButton");
        primary.Click += (_, _) => primaryAction();
        buttons.Children.Add(primary);

        if (secondaryText is not null && secondaryAction is not null)
        {
            var secondary = new Button { Content = secondaryText, MinWidth = 80, IsCancel = true };
            AutomationProperties.SetAutomationId(secondary, "DialogCancelButton");
            secondary.Click += (_, _) => secondaryAction();
            buttons.Children.Add(secondary);
        }

        panel.Children.Add(buttons);
        return primary;
    }

    private static void ValidateName(TextBox input, TextBlock validation, Button save)
    {
        var name = input.Text?.Trim() ?? string.Empty;
        validation.Text = name.Length == 0
            ? "Enter a name."
            : name.Length > Project.NameMaxLength
                ? $"Name must be {Project.NameMaxLength} characters or fewer."
                : string.Empty;
        save.IsEnabled = validation.Text.Length == 0;
    }

    private Window GetOwner()
    {
        var lifetime = Application.Current?.ApplicationLifetime as IClassicDesktopStyleApplicationLifetime;
        return owner ?? lifetime?.MainWindow ?? throw new InvalidOperationException("Main window is unavailable.");
    }
}