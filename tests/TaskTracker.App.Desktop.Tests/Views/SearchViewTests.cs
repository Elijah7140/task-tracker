using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Search interactions through the real headless window.</summary>
public sealed class SearchViewTests
{
    [AvaloniaFact]
    public async Task Ctrl_F_opens_search_and_Escape_returns_home()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();

        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);

        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        Assert.Equal(SearchScopeKind.AllProjects, page.SelectedScope.Kind);
        HeadlessInput.Press(window, Key.Escape);
        Assert.IsType<HomeViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(RawInputModifiers.Control | RawInputModifiers.Shift)]
    [InlineData(RawInputModifiers.Control | RawInputModifiers.Alt)]
    [InlineData(RawInputModifiers.None)]
    public async Task Search_shortcut_ignores_extra_or_missing_modifiers(RawInputModifiers modifiers)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();

        HeadlessInput.Press(window, Key.F, modifiers);

        Assert.IsType<HomeViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Ctrl_F_from_app_settings_opens_search_and_Back_returns_to_the_same_settings_page()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.OpenAppSettingsAsync();
        var settings = shell.CurrentPage;

        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        Assert.IsType<SearchViewModel>(shell.CurrentPage);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SearchBackButton"));

        Assert.Same(settings, shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Ctrl_F_from_project_settings_opens_search_and_Escape_returns_to_the_settings_page()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = ShowShell(window, services);
        await shell.OpenProjectSettingsAsync(project.Id);
        var settings = shell.CurrentPage;

        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        Assert.IsType<SearchViewModel>(shell.CurrentPage);
        HeadlessInput.Press(window, Key.Escape);

        Assert.Same(settings, shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Pressing_Ctrl_F_again_on_the_search_page_keeps_the_original_return_page()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(project.Id);
        var workspace = shell.CurrentPage;

        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        HeadlessInput.Press(window, Key.Escape);

        Assert.Same(workspace, shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Clicking_the_search_buttons_on_home_and_in_a_workspace_opens_search()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "HomeSearchButton"));
        Assert.IsType<SearchViewModel>(shell.CurrentPage);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SearchBackButton"));
        Assert.IsType<HomeViewModel>(shell.CurrentPage);
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "WorkspaceSearchButton"));

        Assert.IsType<SearchViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Back_button_returns_to_the_workspace_search_was_opened_from()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(project.Id);
        var workspace = shell.CurrentPage;
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SearchBackButton"));

        Assert.Same(workspace, shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Ctrl_F_with_an_unsaved_edit_keeps_it_and_activating_a_result_asks_before_discarding()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, "Review invoice");
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(project.Id);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await workspace.SelectItemAsync(Assert.Single(workspace.OpenItems));
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "EditorTitleBox"), " edited");

        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);

        Assert.Empty(window.OwnedWindows);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        await SearchByTypingAsync(window, page, "invoice");
        OpenFirstResultWithEnter(window);
        var prompt = Assert.Single(window.OwnedWindows);
        Assert.Equal("Unsaved changes", prompt.Title);
        HeadlessInput.Press(prompt, Key.Escape);
        await WaitUntilAsync(() => window.OwnedWindows.Count == 0);

        Assert.Same(page, shell.CurrentPage);
        HeadlessInput.Press(window, Key.Escape);
        Assert.Same(workspace, shell.CurrentPage);
        Assert.Equal("Review invoice edited", workspace.Editor?.Title);
        Assert.Equal(item.Id, workspace.Editor?.Id);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData("DraftSaveButton", "Review invoice edited")]
    [InlineData("DraftDiscardButton", "Review invoice")]
    public async Task Result_activation_resolves_one_unsaved_changes_prompt(
        string decisionButtonId, string expectedTitle)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var item = await services.GetRequiredService<ItemService>()
            .CreateAsync(project.Id, null, null, "Review invoice");
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(project.Id);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await workspace.SelectItemAsync(Assert.Single(workspace.OpenItems));
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "EditorTitleBox"), " edited");
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        await SearchByTypingAsync(window, page, "invoice");

        OpenFirstResultWithEnter(window);
        var prompt = Assert.Single(window.OwnedWindows);
        Assert.Equal("Unsaved changes", prompt.Title);
        HeadlessInput.Click(prompt, HeadlessInput.Find<Button>(prompt, decisionButtonId));
        await WaitUntilAsync(() => shell.CurrentPage is ProjectWorkspaceViewModel);

        Assert.Empty(window.OwnedWindows);
        var opened = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal(expectedTitle, opened.Editor?.Title);
        Assert.Equal(item.Id, opened.Editor?.Id);
        var stored = await services.GetRequiredService<ItemService>().LoadAreaAsync(project.Id, null);
        Assert.Equal(expectedTitle, Assert.Single(stored.Items).Item.Title);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Reversed_number_range_shows_an_inline_error_and_disables_search()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        await services.GetRequiredService<FieldService>().CreateAsync("Effort", FieldDataType.Number, project.Id);
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(project.Id);
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "AddFilterButton"));
        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "FilterFieldComboBox"), "Effort");
        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "FilterOperatorComboBox"), "between");

        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "FilterValueNumberBox"), "5");
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "FilterValueSecondNumberBox"), "1");

        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        Assert.False(page.CanSearch);
        Assert.Equal("The first value must not be after the second.",
            HeadlessInput.Find<TextBlock>(window, "FilterValueError").Text);
        Assert.False(HeadlessInput.Find<Button>(window, "SearchButton").IsEnabled);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Adding_a_number_filter_through_controls_finds_only_matching_items()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var effort = await services.GetRequiredService<FieldService>()
            .CreateAsync("Effort", FieldDataType.Number, project.Id);
        await CreateItemWithEffortAsync(services, project.Id, "High effort", effort.Id, 10);
        await CreateItemWithEffortAsync(services, project.Id, "Low effort", effort.Id, 2);
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(project.Id);
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "AddFilterButton"));
        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "FilterFieldComboBox"), "Effort");
        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "FilterOperatorComboBox"), "greater than");
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "FilterValueNumberBox"), "5");
        var row = Assert.Single(page.Filters);
        Assert.Equal("effort", row.SelectedField?.Key);
        Assert.True(page.CanSearch);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SearchButton"));
        await WaitUntilAsync(() => page.Results.Count > 0);

        Assert.Equal(["High effort"], page.Results.Select(result => result.Title));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Changing_the_field_through_the_control_clears_the_old_choice()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "AddFilterButton"));
        var row = Assert.Single(page.Filters);
        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "FilterFieldComboBox"), "Priority");
        await row.ChoicesTask;
        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "FilterValueChoiceComboBox"), "High");
        Assert.NotNull(row.SelectedChoice);
        Assert.True(page.CanSearch);

        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "FilterFieldComboBox"), "Type");
        await row.ChoicesTask;
        Dispatcher.UIThread.RunJobs();

        Assert.Equal("type", row.SelectedField?.Key);
        Assert.Null(row.SelectedChoice);
        Assert.False(page.CanSearch);
        Assert.False(HeadlessInput.Find<Button>(window, "SearchButton").IsEnabled);
        Assert.DoesNotContain(row.Choices, choice => choice.Label == "High");
        window.Close();
    }

    [AvaloniaFact]
    public async Task Changing_scope_through_the_control_keeps_filled_and_blank_filter_rows()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        await services.GetRequiredService<FolderService>().CreateAsync(project.Id, null, "dbo");
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(project.Id);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        workspace.Select(workspace.FolderRoots[0].Children.Single());
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        var addButton = HeadlessInput.Find<Button>(window, "AddFilterButton");
        HeadlessInput.Click(window, addButton);
        HeadlessInput.Click(window, addButton);
        var filled = page.Filters[0];
        HeadlessInput.ChooseItem(window, HeadlessInput.FindAll<ComboBox>(window, "FilterFieldComboBox")[0], "Title");
        HeadlessInput.ChooseItem(window, HeadlessInput.FindAll<ComboBox>(window, "FilterOperatorComboBox")[0], "contains");
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "FilterValueTextBox"), "invoice");

        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "SearchScopeComboBox"), "This project");
        await page.ScopeRefreshTask;
        Dispatcher.UIThread.RunJobs();

        Assert.Equal(SearchScopeKind.Project, page.SelectedScope.Kind);
        Assert.Equal(2, page.Filters.Count);
        Assert.Equal("title", filled.SelectedField?.Key);
        Assert.Equal(FilterOperator.Contains, filled.SelectedOperator?.Operator);
        Assert.Equal("invoice", filled.FirstText);
        Assert.Null(page.Filters[1].SelectedField);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Folder_scope_searches_the_selected_folder_and_the_subfolder_checkbox_narrows_it()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var folders = services.GetRequiredService<FolderService>();
        var folder = await folders.CreateAsync(project.Id, null, "dbo");
        var subfolder = await folders.CreateAsync(project.Id, folder.Id, "Tables");
        var items = services.GetRequiredService<ItemService>();
        await items.CreateAsync(project.Id, null, null, "Root invoice");
        await items.CreateAsync(project.Id, folder.Id, null, "Folder invoice");
        await items.CreateAsync(project.Id, subfolder.Id, null, "Subfolder invoice");
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(project.Id);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        workspace.Select(workspace.FolderRoots[0].Children.Single());
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        Assert.Equal(SearchScopeKind.Folder, page.SelectedScope.Kind);
        Assert.Equal(["All projects", "This project", "This folder"], page.ScopeOptions.Select(option => option.Label));

        await SearchByTypingAsync(window, page, "invoice");

        Assert.Equal(["Folder invoice", "Subfolder invoice"],
            page.Results.Select(result => result.Title).Order());
        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(window, "IncludeSubfoldersCheckBox"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SearchButton"));
        await WaitUntilAsync(() => page.Results.Count == 1);

        Assert.Equal("Folder invoice", page.Results.Single().Title);
        window.Close();
    }

    [AvaloniaFact]
    public async Task More_results_note_names_the_limit()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var items = services.GetRequiredService<ItemService>();

        for (var index = 0; index < SearchViewModel.DefaultResultLimit + 1; index++)
        {
            await items.CreateAsync(project.Id, null, null, $"Review invoice {index:000}");
        }

        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);

        await SearchByTypingAsync(window, page, "invoice");

        var note = HeadlessInput.Find<TextBlock>(window, "SearchHasMoreNote");
        Assert.Equal("Showing the first 200 matches — narrow your search", note.Text);
        Assert.Equal(SearchViewModel.DefaultResultLimit, page.Results.Count);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Result_columns_are_labelled_aligned_and_rows_are_compact()
    {
        var window = new MainWindow { Width = 1200, Height = 800 };
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var items = services.GetRequiredService<ItemService>();
        var first = await items.CreateAsync(project.Id, null, null, "Review invoice");
        var second = await items.CreateAsync(project.Id, null, null, "Review receipts");
        var type = (await services.GetRequiredService<LookupService>().ItemTypesAsync()).First();
        var priority = (await services.GetRequiredService<LookupService>().PriorityLevelsAsync()).First();
        await items.EditAsync(first.Id, new ItemEdit(first.Title, null, "DB-7", type.Id, priority.Id,
            new DateOnly(2026, 11, 20), new TimeOnly(14, 30), null, null));
        await items.EditAsync(second.Id, new ItemEdit(second.Title, null, "DB-8", null, null,
            new DateOnly(2026, 12, 1), null, null, null));
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);

        await SearchByTypingAsync(window, page, "Review");

        var header = HeadlessInput.Find<Grid>(window, "SearchResultsHeader");
        var rows = HeadlessInput.FindAll<ListBoxItem>(window, "SearchResultRow");
        Assert.Equal(2, rows.Count);
        AssertAligned(window, header, "Ticket", rows, ["DB-7", "DB-8"]);
        AssertAligned(window, header, "Title", rows, ["Review invoice", "Review receipts"]);
        AssertAligned(window, header, "Due", rows, [page.Results[0].Due, page.Results[1].Due]);
        Assert.All(["✓", "Title", "Ticket", "Location", "Type", "Priority", "Due"], label =>
            Assert.Contains(header.GetVisualDescendants().OfType<TextBlock>(), text => text.Text == label));
        Assert.All(rows, row => Assert.True(row.Bounds.Height < 40, $"Row is {row.Bounds.Height}px tall."));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Double_clicking_a_search_result_opens_its_item()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var item = await services.GetRequiredService<ItemService>().CreateAsync(
            project.Id, null, null, "Review invoice");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };
        window.Show();
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.Text = "invoice";
        await page.RunAsync();
        Dispatcher.UIThread.RunJobs();
        var list = HeadlessInput.Find<ListBox>(window, "SearchResultsList");
        var listItem = Assert.Single(list.GetVisualDescendants().OfType<ListBoxItem>());
        var point = listItem.TranslatePoint(
            new Point(listItem.Bounds.Width / 2, listItem.Bounds.Height / 2), window)!.Value;

        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);
        Dispatcher.UIThread.RunJobs();
        await WaitUntilAsync(() => shell.CurrentPage is not SearchViewModel);

        Assert.Equal(item.Id, Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage).Editor?.Id);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Typing_and_entering_search_opens_a_result()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var item = await services.GetRequiredService<ItemService>().CreateAsync(
            project.Id, null, null, "Review invoice indexes");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };
        window.Show();
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var searchBox = HeadlessInput.Find<TextBox>(window, "SearchTextBox");

        HeadlessInput.TypeInto(window, searchBox, "invoice");
        HeadlessInput.Press(window, Key.Enter);

        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        Assert.Single(page.Results);
        OpenFirstResultWithEnter(window);
        await WaitUntilAsync(() => shell.CurrentPage is not SearchViewModel);

        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal(item.Id, workspace.Editor?.Id);
        window.Close();
    }

    private static MainWindowViewModel ShowShell(MainWindow window, IServiceProvider services)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        return shell;
    }

    private static async Task SearchByTypingAsync(MainWindow window, SearchViewModel page, string text)
    {
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "SearchTextBox"), text);
        HeadlessInput.Press(window, Key.Enter);
        await WaitUntilAsync(() => page.Results.Count > 0);
        Dispatcher.UIThread.RunJobs();
    }

    private static void OpenFirstResultWithEnter(MainWindow window)
    {
        var list = HeadlessInput.Find<ListBox>(window, "SearchResultsList");
        list.SelectedIndex = 0;
        var listItem = list.GetVisualDescendants().OfType<ListBoxItem>().First();
        HeadlessInput.Click(window, listItem);
        Assert.True(list.IsKeyboardFocusWithin);
        HeadlessInput.Press(window, Key.Enter);
    }

    private static async Task CreateItemWithEffortAsync(
        IServiceProvider services, Guid projectId, string title, Guid fieldId, double effort)
    {
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(projectId, null, null, title);
        var edit = new ItemEdit(title, null, null, null, null, null, null, null, null);
        await items.EditAsync(item.Id, edit, [new FieldValueInput(fieldId, NumberValue: effort)]);
    }

    private static void AssertAligned(MainWindow window, Grid header, string headerText,
        IReadOnlyList<ListBoxItem> rows, IReadOnlyList<string> cellTexts)
    {
        var headerLeft = LeftOf(window, FindText(header, headerText));

        for (var index = 0; index < rows.Count; index++)
        {
            var cell = FindText(rows[index], cellTexts[index]);
            Assert.Equal(headerLeft, LeftOf(window, cell), 1.0);
        }
    }

    private static TextBlock FindText(Visual root, string text)
    {
        return root.GetVisualDescendants().OfType<TextBlock>()
            .First(candidate => candidate.IsEffectivelyVisible && candidate.Text == text);
    }

    private static double LeftOf(Visual window, Visual control)
    {
        return control.TranslatePoint(default, window)!.Value.X;
    }

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        for (var attempt = 0; attempt < 300 && !condition(); attempt++)
        {
            await Task.Delay(10);
        }

        Assert.True(condition(), "The condition was not met in time.");
    }
}