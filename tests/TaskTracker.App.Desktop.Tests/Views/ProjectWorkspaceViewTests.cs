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
    public async Task Dragging_a_row_onto_another_nests_it()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        var first = await items.CreateAsync(project.Id, null, null, "First");
        var second = await items.CreateAsync(project.Id, null, null, "Second");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };
        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var rows = window.GetVisualDescendants().OfType<Border>()
            .Where(border => border.Classes.Contains("itemRow")).ToArray();
        var source = rows.Single(border => (border.DataContext as ItemRowViewModel)?.Id == second.Id);
        var target = rows.Single(border => (border.DataContext as ItemRowViewModel)?.Id == first.Id);

        HeadlessInput.Drag(window, HeadlessInput.CentreOf(window, source),
            HeadlessInput.CentreOf(window, target));
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await HeadlessInput.WaitUntilAsync(() =>
            page.OpenItems.Single(row => row.Id == first.Id).Children.Any(row => row.Id == second.Id));

        Assert.Equal(first.Id, (await items.LoadAreaAsync(project.Id, null)).Items
            .Single(node => node.Item.Id == first.Id).Children.Single().Item.ParentItemId);

        window.Close();
    }

    [AvaloniaFact]
    public async Task Alt_right_and_left_indent_and_outdent_selected_row()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        await items.CreateAsync(project.Id, null, null, "First");
        await items.CreateAsync(project.Id, null, null, "Second");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };
        window.Show();
        await shell.OpenProjectAsync(project.Id);
        ClickTitle(window, "Second");

        HeadlessInput.Press(window, Key.Right, RawInputModifiers.Alt);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await HeadlessInput.WaitUntilAsync(() => page.OpenItems[0].Children.Count == 1);
        HeadlessInput.Press(window, Key.Left, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => page.OpenItems.Count == 2);

        Assert.Equal("Second", page.OpenItems[1].Title);
        Assert.True(page.OpenItems[1].IsSelected);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dragging_a_sub_item_to_a_folder_does_nothing()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var folders = services.GetRequiredService<FolderService>();
        await folders.CreateAsync(project.Id, null, "Area");
        var items = services.GetRequiredService<ItemService>();
        var parent = await items.CreateAsync(project.Id, null, null, "Parent");
        var child = await items.CreateAsync(project.Id, null, parent.Id, "Child");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };
        window.Show();
        await shell.OpenProjectAsync(project.Id);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        page.OpenItems[0].IsExpanded = true;
        Dispatcher.UIThread.RunJobs();
        var row = window.GetVisualDescendants().OfType<Border>()
            .Single(border => border.Classes.Contains("itemRow") &&
                (border.DataContext as ItemRowViewModel)?.Id == child.Id);
        var folder = window.GetVisualDescendants().OfType<TreeViewItem>()
            .Single(item => (item.DataContext as FolderNodeViewModel)?.Name == "Area");

        HeadlessInput.Drag(window, HeadlessInput.CentreOf(window, row),
            HeadlessInput.CentreOf(window, folder));
        var snapshot = await items.LoadAreaAsync(project.Id, null);

        Assert.Equal(child.Id, snapshot.Items.Single().Children.Single().Item.Id);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Ctrl_shift_L_moves_selected_top_level_item_through_folder_dialog()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var folder = await services.GetRequiredService<FolderService>()
            .CreateAsync(project.Id, null, "Destination");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, "Move me");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenProjectAsync(project.Id);
        ClickTitle(window, "Move me");

        HeadlessInput.Press(window, Key.L, RawInputModifiers.Control | RawInputModifiers.Shift);
        var dialog = OpenDialog(window);
        var picker = dialog.GetVisualDescendants().OfType<ComboBox>().Single();
        picker.SelectedIndex = 1;
        HeadlessInput.Press(dialog, Key.Enter);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await HeadlessInput.WaitUntilAsync(() => page.SelectedFolder?.Id == folder.Id);

        Assert.Equal(item.Id, Assert.Single((await items.LoadAreaAsync(project.Id, folder.Id)).Items).Item.Id);
        Assert.True(Assert.Single(page.OpenItems).IsSelected);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Escape_cancels_a_drag_without_moving_the_item()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        var first = await items.CreateAsync(project.Id, null, null, "First");
        var second = await items.CreateAsync(project.Id, null, null, "Second");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };
        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var rows = window.GetVisualDescendants().OfType<Border>()
            .Where(border => border.Classes.Contains("itemRow")).ToArray();
        var source = rows.Single(border => (border.DataContext as ItemRowViewModel)?.Id == second.Id);
        var target = rows.Single(border => (border.DataContext as ItemRowViewModel)?.Id == first.Id);
        var start = HeadlessInput.CentreOf(window, source);
        var finish = HeadlessInput.CentreOf(window, target);

        HeadlessInput.PressMouse(window, start);
        HeadlessInput.MoveMouse(window, finish);
        HeadlessInput.Press(window, Key.Escape);
        HeadlessInput.ReleaseMouse(window, finish);
        var snapshot = await items.LoadAreaAsync(project.Id, null);

        Assert.Equal([first.Id, second.Id], snapshot.Items.Select(node => node.Item.Id));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Tiny_pointer_move_still_selects_item()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var item = await services.GetRequiredService<ItemService>()
            .CreateAsync(project.Id, null, null, "Select me");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };
        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var title = window.GetVisualDescendants().OfType<Button>()
            .First(button => button.IsEffectivelyVisible &&
                button.DataContext is ItemRowViewModel row && row.Id == item.Id &&
                button.Command == row.SelectCommand);
        var start = HeadlessInput.CentreOf(window, title);
        var finish = start + new Point(2, 0);

        HeadlessInput.PressMouse(window, start);
        HeadlessInput.MoveMouse(window, finish);
        HeadlessInput.ReleaseMouse(window, finish);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await HeadlessInput.WaitUntilAsync(() => page.OpenItems[0].IsSelected);

        window.Close();
    }

    [AvaloniaFact]
    public async Task Dragging_a_child_into_empty_item_space_promotes_it_to_root()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        var parent = await items.CreateAsync(project.Id, null, null, "Parent");
        var child = await items.CreateAsync(project.Id, null, parent.Id, "Child");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };
        window.Show();
        await shell.OpenProjectAsync(project.Id);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        page.OpenItems[0].IsExpanded = true;
        Dispatcher.UIThread.RunJobs();
        var row = window.GetVisualDescendants().OfType<Border>()
            .Single(border => border.Classes.Contains("itemRow") &&
                (border.DataContext as ItemRowViewModel)?.Id == child.Id);
        var scroll = window.GetVisualDescendants().OfType<ScrollViewer>()
            .Single(viewer => viewer.Name == "ItemsScrollViewer");
        var empty = HeadlessInput.PointIn(window, scroll, scroll.Bounds.Width / 2,
            scroll.Bounds.Height - 20);

        HeadlessInput.Drag(window, HeadlessInput.CentreOf(window, row), empty);
        await HeadlessInput.WaitUntilAsync(() => page.OpenItems.Count == 2);

        Assert.Equal(child.Id, page.OpenItems[1].Id);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Row_context_move_to_dialog_moves_item_and_restores_focus()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var folder = await services.GetRequiredService<FolderService>()
            .CreateAsync(project.Id, null, "Destination");
        var item = await services.GetRequiredService<ItemService>()
            .CreateAsync(project.Id, null, null, "Move me");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var row = window.GetVisualDescendants().OfType<Border>()
            .Single(border => border.Classes.Contains("itemRow") &&
                (border.DataContext as ItemRowViewModel)?.Id == item.Id);
        var point = HeadlessInput.CentreOf(window, row);

        window.MouseDown(point, MouseButton.Right, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Right, RawInputModifiers.None);
        Dispatcher.UIThread.RunJobs();
        var menu = row.ContextMenu!;
        Assert.True(menu.IsOpen);
        HeadlessInput.Click(window, menu.Items.OfType<MenuItem>().Single());
        var dialog = OpenDialog(window);
        dialog.GetVisualDescendants().OfType<ComboBox>().Single().SelectedIndex = 1;
        HeadlessInput.Press(dialog, Key.Enter);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await HeadlessInput.WaitUntilAsync(() => page.SelectedFolder?.Id == folder.Id);

        Assert.True(Assert.Single(page.OpenItems).IsSelected);
        Assert.Contains(window.GetVisualDescendants().OfType<Button>(), button =>
            button.IsFocused && button.DataContext is ItemRowViewModel selected && selected.Id == item.Id);
        window.Close();
    }
    [AvaloniaFact]
    public async Task Moving_a_finished_selected_item_keeps_its_title_focused_and_visible()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        await items.CreateAsync(project.Id, null, null, "Anchor");
        var finished = await items.CreateAsync(project.Id, null, null, "Finished");
        await items.SetCompletedAsync(project.Id, null, finished.Id, true);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };
        window.Show();
        await shell.OpenProjectAsync(project.Id);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        page.IsCompletedExpanded = true;
        ClickTitle(window, "Finished");

        HeadlessInput.Press(window, Key.Right, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => page.OpenItems.Concat(page.CompletedItems)
            .Any(row => row.Children.Concat(row.CompletedChildren).Any(child => child.Id == finished.Id)));
        Dispatcher.UIThread.RunJobs();

        var focused = Assert.IsType<Button>(TopLevel.GetTopLevel(window)!.FocusManager!.GetFocusedElement());
        var row = Assert.IsType<ItemRowViewModel>(focused.DataContext);
        Assert.Equal(finished.Id, row.Id);
        Assert.True(focused.IsEffectivelyVisible);
        window.Close();
    }

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