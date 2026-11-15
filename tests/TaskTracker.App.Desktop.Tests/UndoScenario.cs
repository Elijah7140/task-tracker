using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Undo;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>A window showing one project with one item, over real services, for undo input tests.</summary>
internal sealed class UndoScenario : IDisposable
{
    public static readonly DateOnly DueDay = new(2026, 11, 13);

    public static readonly DateOnly DayAfter = new(2026, 11, 14);

    private readonly TestServiceScope services;


    private UndoScenario(TestServiceScope services, MainWindow window, Guid projectId, Guid itemId)
    {
        this.services = services;
        Window = window;
        ProjectId = projectId;
        ItemId = itemId;
    }

    public MainWindow Window { get; }

    public Guid ProjectId { get; }

    public Guid ItemId { get; }

    public IServiceProvider Services => services;

    public ItemService Items => services.GetRequiredService<ItemService>();

    public UndoHistory History => services.GetRequiredService<UndoHistory>();

    public MainWindowViewModel Shell => services.GetRequiredService<MainWindowViewModel>();

    public ProjectWorkspaceViewModel Workspace => Assert.IsType<ProjectWorkspaceViewModel>(Shell.CurrentPage);

    public static async Task<UndoScenario> OpenWorkspaceAsync()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        var services = await TestServices.CreateAsync(window);
        return await OpenWorkspaceAsync(services, window, withDueDate: false);
    }

    public static async Task<UndoScenario> OpenWorkspaceAsync(TestServiceScope services, MainWindow window,
        bool withDueDate)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, "Task");
        var due = withDueDate ? DueDay : (DateOnly?)null;
        await items.EditAsync(item.Id, new ItemEdit("Task", null, null, null, null, due, null, null, null));
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        services.GetRequiredService<UndoHistory>().Clear();
        Dispatcher.UIThread.RunJobs();
        return new UndoScenario(services, window, project.Id, item.Id);
    }

    public async Task<DateTime?> ReadCompletionAsync()
    {
        var area = await Items.LoadAreaAsync(ProjectId, null);
        return area.Items.Single(node => node.Item.Id == ItemId).Item.CompletedAtUtc;
    }

    public string OpenTitles()
    {
        return string.Join(",", Workspace.OpenItems.Select(row => row.Title));
    }

    public DateOnly? EntryDay(CalendarViewModel calendar)
    {
        var entries = calendar.Days.SelectMany(day => day.Entries).ToList();
        return entries.Count == 1 ? entries[0].Day : null;
    }

    public void FocusButton(string automationId)
    {
        Window.UpdateLayout();
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Find<Button>(Window, automationId).Focus();
    }

    public void FocusSomethingOtherThanATextBox()
    {
        HeadlessInput.Find<Button>(Window, "WorkspaceSearchButton").Focus();
    }

    public void ClickTitle(string title)
    {
        Dispatcher.UIThread.RunJobs();
        var button = Window.GetVisualDescendants().OfType<Button>()
            .Single(control => control.IsEffectivelyVisible &&
                control.Content is TextBlock text && text.Text == title);
        HeadlessInput.Click(Window, button);
    }

    public void Dispose()
    {
        Window.Close();
        services.Dispose();
    }
}