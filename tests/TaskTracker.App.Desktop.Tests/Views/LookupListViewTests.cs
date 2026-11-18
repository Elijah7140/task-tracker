using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Styling;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Lookups;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Exercises lookup editing through text and pointer input.</summary>
public sealed class LookupListViewTests
{
    [AvaloniaFact]
    public async Task Priority_add_rename_move_up_move_down_and_archive_save_immediately()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenAppSettingsAsync();
        Dispatcher.UIThread.RunJobs();
        var view = FindList(window, isPriority: true);

        Add(window, view, "Urgent");
        Rename(window, view, "Urgent", "Very urgent");
        await MoveAndAssertAsync(window, view, services, "Very urgent", "Move up", "Very urgent", "Low");
        await MoveAndAssertAsync(window, view, services, "Very urgent", "Move down", "Low", "Very urgent");
        ClickAction(window, view, "Very urgent", "Archive");
        Dispatcher.UIThread.RunJobs();

        var rows = await services.GetRequiredService<LookupService>().PriorityLevelsAsync();
        Assert.True(rows.Single(level => level.Name == "Very urgent").IsArchived);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Item_type_add_and_archive_preserves_built_in_types()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenAppSettingsAsync();
        Dispatcher.UIThread.RunJobs();
        var view = FindList(window, isPriority: false);

        Add(window, view, "Review");
        var builtInArchive = view.GetVisualDescendants().OfType<Button>()
            .Single(button => button.DataContext is LookupRowViewModel row && row.Name == "Change" &&
                Equals(ToolTip.GetTip(button), "Built-in types can't be archived"));
        Assert.False(builtInArchive.IsEnabled);
        ClickAction(window, view, "Review", "Archive");
        Dispatcher.UIThread.RunJobs();

        var rows = await services.GetRequiredService<LookupService>().ItemTypesAsync();
        Assert.True(rows.Single(type => type.Name == "Review").IsArchived);
        Assert.False(rows.Single(type => type.Name == "Change").IsArchived);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Status_add_rename_and_move_and_priority_number_box_save_immediately()
    {
        var window = new MainWindow { Width = 1120, Height = 1050 };
        using var services = await TestServices.CreateAsync(window);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenAppSettingsAsync();
        Dispatcher.UIThread.RunJobs();
        var statuses = HeadlessInput.Find<LookupListView>(window, "StatusLookupList");
        var lookups = services.GetRequiredService<LookupService>();

        Add(window, statuses, "Review");
        Rename(window, statuses, "Review", "Ready for review");
        ClickAction(window, statuses, "Ready for review", "Move up");
        var list = Assert.IsType<LookupListViewModel>(statuses.DataContext);
        await HeadlessInput.WaitUntilAsync(() => list.Active[^2].Name == "Ready for review");

        var ordered = await lookups.StatusesAsync();
        Assert.Equal("Ready for review", ordered[^2].Name);
        var priority = FindList(window, isPriority: true);
        var number = HeadlessInput.FindAll<TextBox>(priority, "PriorityNumberBox")
            .Single(box => box.DataContext is LookupRowViewModel { Name: "High" });
        HeadlessInput.TypeInto(window, number, "7");
        HeadlessInput.Press(window, Key.Enter);
        var priorities = Assert.IsType<LookupListViewModel>(priority.DataContext);
        await HeadlessInput.WaitUntilAsync(() => priorities.Active.Any(row => row.DisplayName == "7 · High"));

        Assert.Equal(7, (await lookups.PriorityLevelsAsync()).Single(level => level.Id == BuiltInLookups.HighId).Number);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Priority_lookup_list_matches_approved_image(bool dark)
    {
        Application.Current!.RequestedThemeVariant = dark ? ThemeVariant.Dark : ThemeVariant.Light;
        using var services = await TestServices.CreateAsync();
        var shell = services.GetRequiredService<MainWindowViewModel>();
        await shell.OpenAppSettingsAsync();
        var page = Assert.IsType<AppSettingsViewModel>(shell.CurrentPage);
        var view = new LookupListView { DataContext = page.PriorityLevels };
        var window = new Window { Content = view, Width = 500, Height = 700 };

        window.Show();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"lookup-{(dark ? "dark" : "light")}");
        window.Close();
    }

    private static void Add(Window window, LookupListView view, string name)
    {
        var input = view.GetVisualDescendants().OfType<TextBox>()
            .Single(box => box.PlaceholderText == "New name");
        Click(window, input);
        window.KeyTextInput(name);
        window.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
    }

    private static void Rename(Window window, LookupListView view, string currentName, string newName)
    {
        ClickAction(window, view, currentName, "Rename");
        var dialog = Assert.Single(window.OwnedWindows);
        dialog.KeyTextInput(newName);
        dialog.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
    }

    private static async Task MoveAndAssertAsync(Window window, LookupListView view,
        IServiceProvider services, string name, string action, string penultimate, string last)
    {
        ClickAction(window, view, name, action);
        Dispatcher.UIThread.RunJobs();
        var visible = Assert.IsType<LookupListViewModel>(view.DataContext).Active.Select(row => row.Name).ToArray();
        var stored = (await services.GetRequiredService<LookupService>().PriorityLevelsAsync())
            .Where(level => !level.IsArchived).OrderBy(level => level.SortOrder).Select(level => level.Name).ToArray();

        Assert.Equal(penultimate, visible[^2]);
        Assert.Equal(last, visible[^1]);
        Assert.Equal(visible, stored);
    }

    private static LookupListView FindList(Window window, bool isPriority)
    {
        return window.GetVisualDescendants().OfType<LookupListView>()
            .Single(view => view.DataContext is LookupListViewModel list && !list.IsStatus && list.IsPriority == isPriority);
    }

    private static void ClickAction(Window window, LookupListView view, string name, string action)
    {
        var button = view.GetVisualDescendants().OfType<Button>()
            .Single(control => control.DataContext is LookupRowViewModel row && row.Name == name &&
                Equals(ToolTip.GetTip(control), action));
        Click(window, button);
    }

    private static void Click(Window window, Control control)
    {
        HeadlessInput.Click(window, control);
    }
}