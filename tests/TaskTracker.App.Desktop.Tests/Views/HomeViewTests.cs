using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Exercises project card navigation through pointer input.</summary>
public sealed class HomeViewTests
{
    [AvaloniaFact]
    public async Task Clicking_a_project_card_open_button_opens_the_workspace()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        var button = window.GetVisualDescendants().OfType<Button>()
            .Single(control => Equals(control.Content, "Open"));
        var center = new Point(button.Bounds.Width / 2, button.Bounds.Height / 2);
        var point = button.TranslatePoint(center, window)!.Value;
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);
        Dispatcher.UIThread.RunJobs();

        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal(project.Name, page.SelectedAreaName);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task New_project_dialog_obeys_enter_and_escape(bool cancel)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;

        window.Show();
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        var button = window.GetVisualDescendants().OfType<Button>()
            .Single(control => Equals(control.Content, "+ New project"));
        var point = button.TranslatePoint(new Point(button.Bounds.Width / 2, button.Bounds.Height / 2), window)!.Value;
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);
        Dispatcher.UIThread.RunJobs();
        var dialog = Assert.Single(window.OwnedWindows);
        Assert.Equal("New project", dialog.Title);
        dialog.KeyTextInput("Billing DB");
        dialog.KeyPress(cancel ? Key.Escape : Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);

        Assert.Equal(cancel ? 0 : 1, home.Cards.Count);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Double_clicking_a_project_card_opens_the_right_workspace()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        var card = FindCard(window);
        var title = card.GetVisualDescendants().OfType<TextBlock>().Single(text => text.Text == "Billing");
        var point = title.TranslatePoint(new Point(title.Bounds.Width / 2, title.Bounds.Height / 2), window)!.Value;
        var clickCounts = new List<int>();
        card.PointerPressed += (_, args) => clickCounts.Add(args.ClickCount);
        Click(window, point);
        Click(window, point);
        Dispatcher.UIThread.RunJobs();

        Assert.True(clickCounts.Contains(2), $"Hit {window.InputHitTest(point)?.GetType().Name}; counts: {string.Join(", ", clickCounts)}");
        Assert.Equal(project.Name, Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage).SelectedAreaName);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Enter_on_a_focused_project_card_opens_the_right_workspace()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        var card = FindCard(window);
        card.Focus();
        Assert.True(card.IsFocused);
        window.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();

        Assert.Equal(project.Name, Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage).SelectedAreaName);
        window.Close();
    }

    private static Border FindCard(Window window)
    {
        return window.GetVisualDescendants().OfType<Border>()
            .Single(border => border.Focusable && border.DataContext is ProjectCardViewModel);
    }

    private static void Click(Window window, Point point)
    {
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);
    }
}