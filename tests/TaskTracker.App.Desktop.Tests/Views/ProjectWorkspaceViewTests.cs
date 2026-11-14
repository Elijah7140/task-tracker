using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Exercises workspace keyboard and pointer paths through the real view.</summary>
public sealed class ProjectWorkspaceViewTests
{
    [AvaloniaFact]
    public async Task Opening_a_project_focuses_quick_add()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var quickAdd = FindQuickAdd(window);

        Assert.True(quickAdd.IsFocused);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Typing_in_quick_add_and_pressing_enter_creates_an_item()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        window.KeyTextInput("Review invoice index");
        window.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);

        Assert.Contains(page.OpenItems, item => item.Title == "Review invoice index");
        window.Close();
    }

    [AvaloniaFact]
    public async Task F2_focuses_and_selects_the_selected_item_title()
    {
        using var services = await TestServices.CreateAsync();
        var projects = services.GetRequiredService<ProjectService>();
        var project = await projects.CreateAsync("Billing");
        await services.GetRequiredService<ItemService>().CreateAsync(project.Id, null, null, "Review invoice index");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await page.SelectItemAsync(Assert.Single(page.OpenItems));
        Dispatcher.UIThread.RunJobs();
        window.KeyPress(Key.F2, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        var title = window.GetVisualDescendants().OfType<TextBox>()
            .Single(box => box.Name == "EditorTitleBox");

        Assert.True(title.IsFocused);
        Assert.Equal(title.Text?.Length, title.SelectionEnd - title.SelectionStart);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Ctrl_N_returns_focus_to_quick_add()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var quickAdd = FindQuickAdd(window);
        var folder = window.GetVisualDescendants().OfType<TreeViewItem>().First();
        Click(window, folder);
        Dispatcher.UIThread.RunJobs();
        Assert.False(quickAdd.IsFocused);
        window.KeyPress(Key.N, RawInputModifiers.Control, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();

        Assert.True(FindQuickAdd(window).IsFocused);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Clicking_a_row_checkbox_completes_the_item()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        await services.GetRequiredService<ItemService>().CreateAsync(project.Id, null, null, "Review invoice index");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var checkbox = window.GetVisualDescendants().OfType<CheckBox>()
            .First(box => box.IsEffectivelyVisible);
        Click(window, checkbox);
        Dispatcher.UIThread.RunJobs();
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);

        Assert.Single(page.CompletedItems);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Space_completes_the_selected_row()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        await services.GetRequiredService<ItemService>().CreateAsync(project.Id, null, null, "Review invoice index");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        ClickTitle(window, "Review invoice index");
        window.KeyPress(Key.Space, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);

        Assert.Single(page.CompletedItems);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Alt_down_reorders_the_selected_row()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var items = services.GetRequiredService<ItemService>();
        await items.CreateAsync(project.Id, null, null, "First item");
        await items.CreateAsync(project.Id, null, null, "Second item");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        ClickTitle(window, "First item");
        window.KeyPress(Key.Down, RawInputModifiers.Alt, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);

        Assert.Equal("Second item", page.OpenItems[0].Title);
        Assert.Equal("First item", page.OpenItems[1].Title);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Ctrl_shift_N_opens_new_sub_item_dialog_and_creates_a_child()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        await services.GetRequiredService<ItemService>().CreateAsync(project.Id, null, null, "Parent");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        ClickTitle(window, "Parent");
        window.KeyPress(Key.N, RawInputModifiers.Control | RawInputModifiers.Shift, PhysicalKey.None, null);
        var dialog = OpenDialog(window);
        dialog.KeyTextInput("Child");
        dialog.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);

        Assert.Equal("Child", Assert.Single(Assert.Single(page.OpenItems).Children).Title);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Delete_shows_confirmation_and_obeys_the_choice(bool confirm)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        await services.GetRequiredService<ItemService>().CreateAsync(project.Id, null, null, "Review");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        ClickTitle(window, "Review");
        window.KeyPress(Key.Delete, RawInputModifiers.None, PhysicalKey.None, null);
        var dialog = OpenDialog(window);
        Assert.Equal("Delete item", dialog.Title);
        dialog.KeyPress(confirm ? Key.Enter : Key.Escape, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);

        Assert.Equal(confirm ? 0 : 1, page.OpenItems.Count);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Alt_up_reorders_the_selected_row()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var items = services.GetRequiredService<ItemService>();
        await items.CreateAsync(project.Id, null, null, "First item");
        await items.CreateAsync(project.Id, null, null, "Second item");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        ClickTitle(window, "Second item");
        window.KeyPress(Key.Up, RawInputModifiers.Alt, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);

        Assert.Equal("Second item", page.OpenItems[0].Title);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Clicking_a_folder_selects_its_area()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        await services.GetRequiredService<FolderService>().CreateAsync(project.Id, null, "dbo");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var folder = window.GetVisualDescendants().OfType<TextBlock>()
            .Single(text => text.Text == "dbo");
        Click(window, folder);
        Dispatcher.UIThread.RunJobs();
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);

        Assert.Equal("dbo", page.SelectedAreaName);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Completed_expander_appears_and_toggles_after_completion()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        await services.GetRequiredService<ItemService>().CreateAsync(project.Id, null, null, "Review");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var checkbox = window.GetVisualDescendants().OfType<CheckBox>()
            .First(box => box.IsEffectivelyVisible);
        Click(window, checkbox);
        Dispatcher.UIThread.RunJobs();
        var expander = window.GetVisualDescendants().OfType<Expander>()
            .Single(control => control.IsEffectivelyVisible && Equals(control.Header, "Completed (1)"));
        var header = expander.GetVisualDescendants().OfType<ToggleButton>().First();
        Click(window, header);
        Dispatcher.UIThread.RunJobs();

        Assert.True(expander.IsExpanded);
        Click(window, header);
        Dispatcher.UIThread.RunJobs();
        Assert.False(expander.IsExpanded);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Folder_context_menu_opens_and_new_folder_command_creates_a_child()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var parent = await services.GetRequiredService<FolderService>().CreateAsync(project.Id, null, "dbo");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        ClickFolderMenu(window, "dbo", "New folder");
        var dialog = OpenDialog(window);
        dialog.KeyTextInput("Tables");
        dialog.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();

        var workspace = await services.GetRequiredService<ProjectService>().LoadWorkspaceAsync(project.Id);
        Assert.Contains(workspace.Folders.Children(parent.Id), item => item.Name == "Tables");
        window.Close();
    }

    [AvaloniaFact]
    public async Task Folder_context_rename_command_updates_the_folder()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        await services.GetRequiredService<FolderService>().CreateAsync(project.Id, null, "dbo");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        ClickFolderMenu(window, "dbo", "Rename");
        var dialog = OpenDialog(window);
        dialog.KeyTextInput("Schema");
        dialog.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        var workspace = await services.GetRequiredService<ProjectService>().LoadWorkspaceAsync(project.Id);

        Assert.Contains(workspace.Folders.Children(null), folder => folder.Name == "Schema");
        window.Close();
    }

    [AvaloniaFact]
    public async Task Folder_context_delete_command_deletes_after_confirmation()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        await services.GetRequiredService<FolderService>().CreateAsync(project.Id, null, "dbo");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        ClickFolderMenu(window, "dbo", "Delete");
        var dialog = OpenDialog(window);
        dialog.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        var workspace = await services.GetRequiredService<ProjectService>().LoadWorkspaceAsync(project.Id);

        Assert.Empty(workspace.Folders.Children(null));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Folder_context_move_command_moves_a_child_to_root()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var folders = services.GetRequiredService<FolderService>();
        var parent = await folders.CreateAsync(project.Id, null, "dbo");
        await folders.CreateAsync(project.Id, parent.Id, "Tables");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        ClickFolderMenu(window, "Tables", "Move");
        var dialog = OpenDialog(window);
        dialog.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        var workspace = await services.GetRequiredService<ProjectService>().LoadWorkspaceAsync(project.Id);

        Assert.Contains(workspace.Folders.Children(null), folder => folder.Name == "Tables");
        window.Close();
    }

    private static void ClickFolderMenu(Window window, string name, string action)
    {
        Dispatcher.UIThread.RunJobs();
        var folder = window.GetVisualDescendants().OfType<TextBlock>()
            .Single(text => text.Text == name && text.GetVisualAncestors().OfType<TreeViewItem>().Any());
        var treeItem = folder.GetVisualAncestors().OfType<TreeViewItem>().First();
        var point = treeItem.TranslatePoint(new Point(60, treeItem.Bounds.Height / 2), window)!.Value;
        window.MouseDown(point, MouseButton.Right, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Right, RawInputModifiers.None);
        Dispatcher.UIThread.RunJobs();
        var menu = treeItem.ContextMenu!;
        Assert.True(menu.IsOpen);
        Click(window, menu.Items.OfType<MenuItem>().Single(item => Equals(item.Header, action)));
    }

    private static Window OpenDialog(Window owner)
    {
        Dispatcher.UIThread.RunJobs();
        return Assert.Single(owner.OwnedWindows);
    }

    private static void ClickTitle(Window window, string title)
    {
        Dispatcher.UIThread.RunJobs();
        var button = window.GetVisualDescendants().OfType<Button>()
            .Single(control => control.IsEffectivelyVisible &&
                control.Content is TextBlock text && text.Text == title);
        Click(window, button);
        Dispatcher.UIThread.RunJobs();
    }

    private static void Click(Window window, Control control)
    {
        var center = new Avalonia.Point(control.Bounds.Width / 2, control.Bounds.Height / 2);
        var point = control.TranslatePoint(center, window)!.Value;
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);
    }

    private static TextBox FindQuickAdd(Window window)
    {
        return window.GetVisualDescendants().OfType<TextBox>()
            .Single(box => box.Name == "QuickAddBox");
    }
}