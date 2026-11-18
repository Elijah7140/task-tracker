using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Styling;
using Avalonia.VisualTree;

using CommunityToolkit.Mvvm.Input;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop;
using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.Search;
using TaskTracker.Core.Settings;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

public sealed class MainWindowTests
{
    [AvaloniaFact]
    public async Task Home_renders_project_cards()
    {
        using var services = await TestServices.CreateAsync();
        var projects = services.GetRequiredService<ProjectService>();
        await projects.CreateAsync("Billing DB");
        await projects.CreateAsync("Website refresh");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.GoHomeAsync();
        using var frame = window.CaptureRenderedFrame();

        Assert.Equal("Task Tracker", window.Title);
        Assert.NotNull(frame);
        Assert.NotEmpty(window.GetVisualDescendants().OfType<HomeView>());
        TestScreenshots.SaveIfRequested(frame!, "home.png");
        window.Close();
    }

    [AvaloniaFact]
    public async Task App_title_bar_leaves_the_window_title_to_the_drawn_decorations()
    {
        using var services = await TestServices.CreateAsync();
        var shell = services.GetRequiredService<MainWindowViewModel>();
        shell.EnableReminders(services.GetRequiredService<ReminderService>());
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.GoHomeAsync();
        var titleBar = window.GetVisualDescendants().OfType<Grid>().Single(grid => grid.Name == "AppTitleBar");
        var titleTexts = titleBar.GetVisualDescendants()
            .OfType<TextBlock>()
            .Where(block => block.Text == window.Title);

        Assert.True(titleBar.IsEffectivelyVisible);
        Assert.Empty(titleTexts);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Workspace_renders_nested_folders()
    {
        using var services = await TestServices.CreateAsync();
        var projects = services.GetRequiredService<ProjectService>();
        var folders = services.GetRequiredService<FolderService>();
        var project = await projects.CreateAsync("Billing DB");
        var schema = await folders.CreateAsync(project.Id, null, "dbo");
        await folders.CreateAsync(project.Id, schema.Id, "Tables");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        page.Select(page.FolderRoots[0].Children[0].Children[0]);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        Assert.NotEmpty(window.GetVisualDescendants().OfType<ProjectWorkspaceView>());
        TestScreenshots.SaveIfRequested(frame!, "workspace.png");
        window.Close();
    }

    [AvaloniaFact]
    public async Task Tall_folder_tree_scrolls_inside_the_workspace()
    {
        using var services = await TestServices.CreateAsync();
        var projects = services.GetRequiredService<ProjectService>();
        var folders = services.GetRequiredService<FolderService>();
        var project = await projects.CreateAsync("Many folders");

        for (var index = 0; index < 35; index++)
        {
            await folders.CreateAsync(project.Id, null, $"Folder {index:00}");
        }

        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        TestScreenshots.SaveIfRequested(frame!, "tall-tree.png");
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dark_workspace_renders_nested_selection()
    {
        using var services = await TestServices.CreateAsync();
        var projects = services.GetRequiredService<ProjectService>();
        var folders = services.GetRequiredService<FolderService>();
        var project = await projects.CreateAsync("Billing DB");
        var parent = await folders.CreateAsync(project.Id, null, "dbo");
        await folders.CreateAsync(project.Id, parent.Id, "Tables");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };
        var application = Avalonia.Application.Current!;
        var originalTheme = application.RequestedThemeVariant;

        application.RequestedThemeVariant = ThemeVariant.Dark;
        window.Show();
        await shell.OpenProjectAsync(project.Id);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        page.Select(page.FolderRoots[0].Children[0].Children[0]);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        TestScreenshots.SaveIfRequested(frame!, "workspace-dark.png");
        window.Close();
        application.RequestedThemeVariant = originalTheme;
    }

    [AvaloniaFact]
    public async Task Workspace_renders_item_urgency_completion_and_editor_in_both_themes()
    {
        using var services = await TestServices.CreateAsync();
        var (projectId, parentId) = await SeedUrgencyWorkspaceAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell, Height = 640 };
        var application = Avalonia.Application.Current!;
        var originalTheme = application.RequestedThemeVariant;

        window.Show();
        await shell.OpenProjectAsync(projectId);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        var parentRow = page.OpenItems.Single(row => row.Id == parentId);
        parentRow.IsExpanded = true;
        await page.SelectItemAsync(parentRow);

        AssertExpandedParentRow(parentRow);
        CaptureLightWorkspace(window, page);
        var editorScroll = FindEditorScroll(window, page);
        CaptureLightEditorScrolledDown(window, editorScroll);
        application.RequestedThemeVariant = ThemeVariant.Dark;
        CaptureDarkWorkspaceAndEditor(window, page, editorScroll);
        application.RequestedThemeVariant = originalTheme;
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Checkbox_click_restores_persisted_state_when_completion_does_not_change(bool blocked)
    {
        using var services = await TestServices.CreateAsync();
        var projectId = await SeedParentWithChildAsync(services, completeChild: blocked);
        var dialogs = new CompletionDialogs();
        using var page = new ProjectWorkspaceViewModel(projectId, services.GetRequiredService<ProjectService>(),
            services.GetRequiredService<FolderService>(), dialogs, new TestNavigation(),
            services.GetRequiredService<ItemService>());
        var (window, view) = await ShowWorkspaceWithCompletedExpandedAsync(page);
        var row = blocked ? Assert.Single(page.CompletedItems) : Assert.Single(page.OpenItems);
        var checkboxes = view.GetVisualDescendants().OfType<CheckBox>()
            .Where(box => ReferenceEquals(box.DataContext, row)).ToArray();
        var checkbox = blocked ? checkboxes.Last() : checkboxes.First();

        await ClickAndWaitForToggleAsync(window, checkbox, row);

        Assert.Equal(blocked, checkbox.IsChecked);
        Assert.Equal(blocked, row.IsComplete);
        Assert.Equal(blocked ? 1 : 0, dialogs.Messages.Count);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Settings_screens_render_in_both_themes()
    {
        using var services = await TestServices.CreateAsync();
        var projectId = await SeedSettingsScreensAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };
        var application = Avalonia.Application.Current!;
        var originalTheme = application.RequestedThemeVariant;

        window.Show();
        await shell.OpenAppSettingsAsync();
        CaptureInBothThemes(window, "app-settings", AssertAppSettingsLayout);
        application.RequestedThemeVariant = ThemeVariant.Light;
        await shell.OpenProjectSettingsAsync(projectId);
        CaptureInBothThemes(window, "project-settings", AssertProjectSettingsLayout);
        application.RequestedThemeVariant = originalTheme;
        window.Close();
    }

    /// <summary>
    /// Seeds a parent with a sub-item and items in each urgency band, all relative to the test clock's
    /// today, plus one completed item. Returns the project and the parent.
    /// </summary>
    private static async Task<(Guid ProjectId, Guid ParentId)> SeedUrgencyWorkspaceAsync(IServiceProvider services)
    {
        var items = services.GetRequiredService<ItemService>();
        var lookups = services.GetRequiredService<LookupService>();
        var change = (await lookups.ItemTypesAsync()).Single(type => type.Name == "Change");
        var high = (await lookups.PriorityLevelsAsync()).Single(level => level.Name == "High");
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var today = TestToday();
        var parent = await items.CreateAsync(project.Id, null, null, "Update invoice indexes");
        var child = await items.CreateAsync(project.Id, null, parent.Id, "Check query plan");
        await items.EditAsync(parent.Id, new ItemEdit(parent.Title, "Review the billing schema",
            "DB-119", change.Id, high.Id, today.AddDays(10), new TimeOnly(15, 30),
            today.AddDays(5).ToDateTime(new TimeOnly(9, 0)),
            today.AddDays(5).ToDateTime(new TimeOnly(10, 0))));
        await items.EditAsync(child.Id, new ItemEdit(child.Title, null, "DB-120", change.Id, high.Id,
            today.AddDays(-1), null, null, null));
        await SeedUrgencyBandsAsync(items, project.Id, change.Id, high.Id);

        return (project.Id, parent.Id);
    }

    /// <summary>Adds an imminent, an approaching, an undated and a completed top-level item.</summary>
    private static async Task SeedUrgencyBandsAsync(ItemService items, Guid projectId, Guid changeId, Guid highId)
    {
        var today = TestToday();
        var imminent = await items.CreateAsync(projectId, null, null, "Review migration");
        var approaching = await items.CreateAsync(projectId, null, null, "Prepare release notes");
        await items.CreateAsync(projectId, null, null, "Plan next quarter");
        var finished = await items.CreateAsync(projectId, null, null, "Schema review complete");
        await items.EditAsync(imminent.Id, new ItemEdit(imminent.Title, null, "DB-121", changeId, highId,
            today, null, null, null));
        await items.EditAsync(approaching.Id, new ItemEdit(approaching.Title, null, null, null, null,
            today.AddDays(2), null, null, null));
        await items.SetCompletedAsync(projectId, null, finished.Id, true);
    }

    private static DateOnly TestToday()
    {
        var localNow = TimeZoneInfo.ConvertTime(TestServices.Clock.GetUtcNow(), TestServices.TimeZone);

        return DateOnly.FromDateTime(localNow.DateTime);
    }

    private static void AssertExpandedParentRow(ItemRowViewModel parentRow)
    {
        Assert.Equal("Change", Assert.Single(parentRow.Children).TypeName);
        Assert.Equal("High", Assert.Single(parentRow.Children).PriorityName);
        Assert.Equal("Overdue", parentRow.UrgencyLabel);
        Assert.True(parentRow.HasSource);
        Assert.True(parentRow.IsSelected);
        Assert.Equal("▾", parentRow.ExpanderGlyph);
    }

    /// <summary>Captures the light workspace with Completed collapsed, then expanded, and checks what is rendered.</summary>
    private static void CaptureLightWorkspace(Window window, ProjectWorkspaceViewModel page)
    {
        using var collapsed = window.CaptureRenderedFrame();
        TestScreenshots.SaveIfRequested(collapsed!, "workspace-items-collapsed.png");
        page.IsCompletedExpanded = true;
        using var light = window.CaptureRenderedFrame();

        Assert.NotNull(light);
        AssertRenderedWorkspace(window);
        TestScreenshots.SaveIfRequested(light!, "workspace-items-light.png");
    }

    private static void AssertRenderedWorkspace(Window window)
    {
        var controls = window.GetVisualDescendants().OfType<Control>().ToArray();
        var save = controls.OfType<Button>().Single(button => Equals(button.Content, "Save"));
        var revert = controls.OfType<Button>().Single(button => Equals(button.Content, "Revert"));

        Assert.Contains(controls.OfType<TextBlock>(), text => text.Text == "High");
        Assert.Contains(controls.OfType<TextBlock>(), text => text.Text == "Overdue");
        Assert.Contains(controls.OfType<TextBlock>(), text => text.Text == "↳ sub");
        Assert.Contains(controls.OfType<Border>(), border => border.Classes.Contains("selected"));
        Assert.Contains(controls.OfType<Border>(), border => border.Classes.Contains("itemCard"));
        Assert.True(save.Bounds.Bottom <= window.Bounds.Bottom);
        Assert.True(revert.Bounds.Bottom <= window.Bounds.Bottom);
        Assert.Equal(3, controls.OfType<CalendarDatePicker>().Count());
        Assert.Equal(3, controls.OfType<TimePicker>().Count());
    }

    /// <summary>The item editor's scroll viewer: the narrow one bound to the page with the most to scroll.</summary>
    private static ScrollViewer FindEditorScroll(Window window, ProjectWorkspaceViewModel page)
    {
        return window.GetVisualDescendants()
            .OfType<ScrollViewer>()
            .Where(scroll => ReferenceEquals(scroll.DataContext, page) && scroll.Bounds.Width is > 280 and < 340)
            .OrderByDescending(scroll => scroll.Extent.Height - scroll.Viewport.Height)
            .First();
    }

    private static void CaptureLightEditorScrolledDown(Window window, ScrollViewer editorScroll)
    {
        editorScroll.Offset = new Avalonia.Vector(0, 500);
        using var editorLight = window.CaptureRenderedFrame();

        Assert.True(editorScroll.Offset.Y > 0);
        AssertSubItemsAndClearButtons(window, editorScroll);
        TestScreenshots.SaveIfRequested(editorLight!, "workspace-editor-light.png");
        editorScroll.Offset = default;
    }

    private static void CaptureDarkWorkspaceAndEditor(Window window, ProjectWorkspaceViewModel page, ScrollViewer editorScroll)
    {
        page.IsCompletedExpanded = false;
        using var darkCollapsed = window.CaptureRenderedFrame();
        TestScreenshots.SaveIfRequested(darkCollapsed!, "workspace-items-collapsed-dark.png");
        page.IsCompletedExpanded = true;
        using var dark = window.CaptureRenderedFrame();
        TestScreenshots.SaveIfRequested(dark!, "workspace-items-dark.png");
        editorScroll.Offset = new Avalonia.Vector(0, 500);
        using var editorDark = window.CaptureRenderedFrame();
        TestScreenshots.SaveIfRequested(editorDark!, "workspace-editor-dark.png");

        Assert.NotNull(dark);
    }

    /// <summary>Creates a parent with one child, optionally completed, and returns the project.</summary>
    private static async Task<Guid> SeedParentWithChildAsync(IServiceProvider services, bool completeChild)
    {
        var items = services.GetRequiredService<ItemService>();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var parent = await items.CreateAsync(project.Id, null, null, "Parent");
        var child = await items.CreateAsync(project.Id, null, parent.Id, "Child");

        if (completeChild)
        {
            await items.SetCompletedAsync(project.Id, null, child.Id, true);
        }

        return project.Id;
    }

    private static async Task<(Window Window, ProjectWorkspaceView View)> ShowWorkspaceWithCompletedExpandedAsync(
        ProjectWorkspaceViewModel page)
    {
        var view = new ProjectWorkspaceView { DataContext = page };
        var window = new Avalonia.Controls.Window { Content = view, Width = 1200, Height = 800 };
        window.Show();
        await page.LoadAsync();
        page.IsCompletedExpanded = true;
        using var frame = window.CaptureRenderedFrame();

        return (window, view);
    }

    /// <summary>Clicks the row's checkbox and waits for the toggle command it starts, if any.</summary>
    private static async Task ClickAndWaitForToggleAsync(Window window, CheckBox checkbox, ItemRowViewModel row)
    {
        var center = new Avalonia.Point(checkbox.Bounds.Width / 2, checkbox.Bounds.Height / 2);
        var point = checkbox.TranslatePoint(center, window)!.Value;
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);
        var command = Assert.IsAssignableFrom<IAsyncRelayCommand>(row.ToggleCommand);

        if (command.ExecutionTask is Task execution)
        {
            await execution;
        }
    }

    /// <summary>Creates a project with yellow and reminder overrides and an archived item type; returns the project.</summary>
    private static async Task<Guid> SeedSettingsScreensAsync(IServiceProvider services)
    {
        var settings = services.GetRequiredService<SettingsService>();
        var lookups = services.GetRequiredService<LookupService>();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var archived = await lookups.AddItemTypeAsync("Legacy");
        await lookups.ArchiveItemTypeAsync(archived.Id);
        await settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(5));
        await settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.DefaultReminderOffset, TimeSpan.FromMinutes(15));

        return project.Id;
    }

    /// <summary>Captures the current screen in the current theme, checks its layout, then captures it in dark.</summary>
    private static void CaptureInBothThemes(Window window, string screen, Action<Window> assertLayout)
    {
        using var light = window.CaptureRenderedFrame();
        TestScreenshots.SaveIfRequested(light!, $"{screen}-light.png");
        assertLayout(window);
        Avalonia.Application.Current!.RequestedThemeVariant = ThemeVariant.Dark;
        using var dark = window.CaptureRenderedFrame();
        TestScreenshots.SaveIfRequested(dark!, $"{screen}-dark.png");

        Assert.NotNull(light);
        Assert.NotNull(dark);
    }

    private static void AssertAppSettingsLayout(Window window)
    {
        var view = window.GetVisualDescendants().OfType<AppSettingsView>().Single();
        var buttons = view.GetVisualDescendants().OfType<Button>().ToArray();

        Assert.Empty(view.GetVisualDescendants().OfType<ListBox>());
        Assert.Equal(3, view.GetVisualDescendants().OfType<LookupListView>().Count());
        Assert.Contains(buttons, button => Equals(button.Content, "Save defaults"));
        Assert.Contains(buttons, button => Equals(button.Content, "Restore") && button.IsEffectivelyVisible);
        Assert.Equal(1, view.GetVisualDescendants().OfType<TextBlock>().Count(text => text.Text == "Archived" && text.IsEffectivelyVisible));
    }

    private static void AssertProjectSettingsLayout(Window window)
    {
        var view = window.GetVisualDescendants().OfType<ProjectSettingsView>().Single();
        var resets = view.GetVisualDescendants().OfType<Button>()
            .Where(button => Equals(button.Content, "Reset to global"))
            .ToArray();

        Assert.Equal(6, resets.Length);
        Assert.Equal(2, resets.Count(button => button.IsVisible));
        Assert.NotNull(HeadlessInput.Find<Button>(window, "ProjectReminderOffsetReset"));
    }

    private static void AssertSubItemsAndClearButtons(Window window, ScrollViewer editorScroll)
    {
        var controls = window.GetVisualDescendants().OfType<Control>().ToArray();
        var scrollBar = editorScroll.GetVisualDescendants().OfType<ScrollBar>()
            .First(bar => bar.Orientation == Avalonia.Layout.Orientation.Vertical && ReferenceEquals(bar.TemplatedParent, editorScroll));
        var scrollBarLeft = scrollBar.TranslatePoint(default, window)!.Value.X;
        var clearButtons = controls.OfType<Button>().Where(button => Equals(button.Content, "✕")).ToArray();

        Assert.DoesNotContain(controls.OfType<Button>(), button => Equals(button.Content, "Check query plan"));
        Assert.Equal(4, clearButtons.Length);

        foreach (var clear in clearButtons)
        {
            var right = clear.TranslatePoint(new Point(clear.Bounds.Width, 0), window)!.Value.X;
            Assert.True(right <= scrollBarLeft, $"Clear button right edge {right} overlaps scrollbar at {scrollBarLeft}.");
        }
    }

    private sealed class CompletionDialogs : IDialogService
    {
        public List<string> Messages { get; } = [];

        public Task<string?> PromptAsync(string title, string label, string? initialValue = null)
        {
            return Task.FromResult<string?>(null);
        }

        public Task<bool> ConfirmAsync(string title, string message, string confirmText = "Continue", bool cancelIsDefault = false)
        {
            return Task.FromResult(false);
        }

        public Task<DraftDecision> ResolveDraftAsync()
        {
            return Task.FromResult(DraftDecision.Cancel);
        }

        public Task<FolderChoice?> PickFolderAsync(string title, IReadOnlyList<FolderChoice> folders,
            string label = "Move into", string confirmText = "Move")
        {
            return Task.FromResult<FolderChoice?>(null);
        }

        public Task<int?> ChooseAsync(string title, string label, IReadOnlyList<string> options,
            string confirmText = "Choose")
        {
            return Task.FromResult<int?>(null);
        }

        public Task<bool> ShowImportPreviewAsync(CsvImportPreviewViewModel preview)
        {
            return Task.FromResult(false);
        }

        public Task ShowMessageAsync(string title, string message)
        {
            Messages.Add(message);
            return Task.CompletedTask;
        }
    }

    private sealed class TestNavigation : INavigationService
    {
        public Task GoHomeAsync()
        {
            return Task.CompletedTask;
        }

        public Task OpenProjectAsync(Guid projectId)
        {
            return Task.CompletedTask;
        }

        public Task OpenSearchAsync()
        {
            return Task.CompletedTask;
        }

        public Task ReturnFromSearchAsync()
        {
            return Task.CompletedTask;
        }

        public Task OpenCalendarAsync()
        {
            return Task.CompletedTask;
        }

        public Task ReturnFromCalendarAsync()
        {
            return Task.CompletedTask;
        }

        public Task OpenTrashAsync()
        {
            return Task.CompletedTask;
        }

        public Task ReturnFromTrashAsync()
        {
            return Task.CompletedTask;
        }

        public Task<SearchOpenOutcome> OpenCalendarItemAsync(Guid itemId)
        {
            return Task.FromResult(SearchOpenOutcome.Opened);
        }

        public Task<SearchOpenOutcome> OpenSearchResultAsync(ItemSearchResult result)
        {
            return Task.FromResult(SearchOpenOutcome.Opened);
        }
    }

}