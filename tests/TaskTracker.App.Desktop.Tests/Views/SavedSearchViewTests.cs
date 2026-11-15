using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>The query syntax box, the help popup and saved searches, driven by simulated input.</summary>
public sealed class SavedSearchViewTests
{
    [AvaloniaFact]
    public async Task Typing_a_query_and_pressing_Enter_shows_the_filter_rows_and_matching_results()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await SeedAsync(services);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);

        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "SearchTextBox"), "type:error priority>=high");
        HeadlessInput.Press(window, Key.Enter);
        await HeadlessInput.WaitUntilAsync(() => page.Results.Count > 0 && page.Filters.Count == 2);

        Assert.Equal(["Fix deadlock"], page.Results.Select(result => result.Title));
        Assert.Equal(2, HeadlessInput.FindAll<ComboBox>(window, "FilterFieldComboBox").Count);
        Assert.Equal("Type", page.Filters[0].SelectedField?.DisplayName);
        Assert.Equal("type:error priority>=high", HeadlessInput.Find<TextBox>(window, "SearchTextBox").Text);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Editing_a_row_through_its_controls_rewrites_the_text_box()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "AddFilterButton"));

        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "FilterFieldComboBox"), "Title");
        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "FilterOperatorComboBox"), "contains");
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "FilterValueTextBox"), "lock");
        Dispatcher.UIThread.RunJobs();

        Assert.Equal("title~lock", HeadlessInput.Find<TextBox>(window, "SearchTextBox").Text);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_query_with_an_unknown_field_shows_the_error_and_runs_nothing()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await SeedAsync(services);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);

        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "SearchTextBox"), "tpye:error");
        HeadlessInput.Press(window, Key.Enter);
        await HeadlessInput.WaitUntilAsync(() => page.Error is not null);
        Dispatcher.UIThread.RunJobs();

        var message = HeadlessInput.Find<TextBlock>(window, "SearchErrorText").Text;
        Assert.Contains("Unknown field 'tpye'. Did you mean 'type'?", message);
        Assert.Empty(page.Results);
        Assert.Empty(page.Filters);
        window.Close();
    }

    [AvaloniaFact]
    public async Task The_help_button_opens_a_popup_listing_the_syntax()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SearchHelpButton"));
        Dispatcher.UIThread.RunJobs();

        var panel = HeadlessInput.Find<StackPanel>(window, "SearchHelpPanel");
        var texts = panel.GetVisualDescendants().OfType<TextBlock>().Select(text => text.Text).ToList();
        Assert.Contains("Query syntax", texts);
        Assert.Contains("type:error", texts);
        Assert.Contains("is:done  is:open", texts);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_search_can_be_saved_opened_from_home_renamed_and_deleted()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await SeedAsync(services);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "SearchTextBox"), "type:error");
        HeadlessInput.Press(window, Key.Enter);
        await HeadlessInput.WaitUntilAsync(() => page.Results.Count == 2);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SaveSearchButton"));
        AnswerPrompt(window, "Save search", "Errors");
        await HeadlessInput.WaitUntilAsync(() => page.SavedSearches!.Items.Count == 1);
        Assert.Single(HeadlessInput.FindAll<Button>(window, "SavedSearchChip"));
        HeadlessInput.Press(window, Key.Escape);
        await HeadlessInput.WaitUntilAsync(() => shell.CurrentPage is HomeViewModel);
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.Click(window, HeadlessInput.FindNamed<Button>(window, "SavedSearchLink", "Errors"));
        await HeadlessInput.WaitUntilAsync(() => shell.CurrentPage is SearchViewModel { Results.Count: 2 });
        var reopened = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        Assert.Equal("type:Error", HeadlessInput.Find<TextBox>(window, "SearchTextBox").Text);
        Assert.Equal("Errors", reopened.SavedSearches!.Selected?.Name);
        HeadlessInput.Press(window, Key.Escape);
        await HeadlessInput.WaitUntilAsync(() => shell.CurrentPage is HomeViewModel);
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "RenameSavedSearchLinkButton"));
        AnswerPrompt(window, "Rename saved search", "Failures");
        var home = Assert.IsType<HomeViewModel>(shell.CurrentPage);
        await HeadlessInput.WaitUntilAsync(() => home.SavedSearches!.Items.Any(entry => entry.Name == "Failures"));
        Dispatcher.UIThread.RunJobs();
        Assert.Single(HeadlessInput.FindAll<Button>(window, "SavedSearchLink"));

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "DeleteSavedSearchLinkButton"));
        var confirm = Assert.Single(window.OwnedWindows);
        HeadlessInput.Click(confirm, HeadlessInput.Find<Button>(confirm, "DialogConfirmButton"));
        await HeadlessInput.WaitUntilAsync(() => home.SavedSearches!.Items.Count == 0);
        Dispatcher.UIThread.RunJobs();

        Assert.Empty(HeadlessInput.FindAll<Button>(window, "SavedSearchLink"));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Saving_over_an_existing_name_asks_for_confirmation()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "SearchTextBox"), "has:ticket");
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SaveSearchButton"));
        AnswerPrompt(window, "Save search", "Tickets");
        await HeadlessInput.WaitUntilAsync(() => page.SavedSearches!.Items.Count == 1);
        var service = services.GetRequiredService<TaskTracker.Core.SavedSearches.SavedSearchService>();
        var original = Assert.Single(await service.ListAsync()).QueryText;

        HeadlessInput.Click(window, HeadlessInput.Find<TextBox>(window, "SearchTextBox"));
        HeadlessInput.Press(window, Key.A, RawInputModifiers.Control);
        window.KeyTextInput("no:ticket");
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SaveSearchButton"));
        AnswerPrompt(window, "Save search", "tickets");
        await HeadlessInput.WaitUntilAsync(() => window.OwnedWindows.Count == 1);
        var confirm = Assert.Single(window.OwnedWindows);
        Assert.Equal("Replace saved search", confirm.Title);
        HeadlessInput.Press(confirm, Key.Escape);
        await HeadlessInput.WaitUntilAsync(() => window.OwnedWindows.Count == 0);

        Assert.Equal(["Tickets"], page.SavedSearches!.Items.Select(entry => entry.Name));
        Assert.Equal(original, Assert.Single(await service.ListAsync()).QueryText);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Clicking_Search_submits_valid_text_despite_an_incomplete_row()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await SeedAsync(services);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "AddFilterButton"));
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "SearchTextBox"), "type:error");
        var button = HeadlessInput.Find<Button>(window, "SearchButton");
        Assert.True(button.IsEnabled);
        HeadlessInput.Click(window, button);
        await HeadlessInput.WaitUntilAsync(() => page.Results.Count == 2);

        Assert.Single(page.Filters);
        Assert.Equal("type", page.Filters[0].SelectedField?.Key);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_saved_search_whose_project_was_deleted_shows_an_inline_error()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Doomed");
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(project.Id);
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "SearchTextBox"), "has:ticket");
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SaveSearchButton"));
        AnswerPrompt(window, "Save search", "Doomed tickets");
        await HeadlessInput.WaitUntilAsync(() => page.SavedSearches!.Items.Count == 1);
        await services.GetRequiredService<ProjectService>().DeleteAsync(project.Id);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.Click(window, HeadlessInput.FindNamed<Button>(window, "SavedSearchLink", "Doomed tickets"));
        await HeadlessInput.WaitUntilAsync(() => shell.CurrentPage is SearchViewModel { Error: not null });
        Dispatcher.UIThread.RunJobs();

        var message = HeadlessInput.Find<TextBlock>(window, "SearchErrorText").Text;
        Assert.StartsWith("The saved search 'Doomed tickets' can't be run.", message);
        window.Close();
    }

    /// <summary>Types the name into the prompt dialog that is open on the window and presses Enter.</summary>
    private static void AnswerPrompt(MainWindow window, string expectedTitle, string answer)
    {
        var dialog = Assert.Single(window.OwnedWindows);
        Assert.Equal(expectedTitle, dialog.Title);
        var input = HeadlessInput.Find<TextBox>(dialog, "DialogInput");
        input.SelectAll();
        dialog.KeyTextInput(answer);
        HeadlessInput.Press(dialog, Key.Enter);
    }

    private static async Task SeedAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var items = services.GetRequiredService<ItemService>();
        var lookups = services.GetRequiredService<LookupService>();
        var types = await lookups.ItemTypesAsync();
        var levels = await lookups.PriorityLevelsAsync();
        var error = types.Single(type => type.Name == "Error").Id;
        var discussion = types.Single(type => type.Name == "Discussion").Id;
        await CreateAsync(items, project.Id, "Fix deadlock", error, levels.Single(level => level.Name == "High").Id);
        await CreateAsync(items, project.Id, "Tidy logs", error, levels.Single(level => level.Name == "Low").Id);
        await CreateAsync(items, project.Id, "Talk deadlock", discussion, levels.Single(level => level.Name == "High").Id);
    }

    private static async Task CreateAsync(
        ItemService items, Guid projectId, string title, Guid typeId, Guid priorityId)
    {
        var item = await items.CreateAsync(projectId, null, null, title);
        await items.EditAsync(item.Id, new ItemEdit(title, null, null, typeId, priorityId, null, null, null, null));
    }

    private static MainWindowViewModel ShowShell(MainWindow window, IServiceProvider services)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        return shell;
    }
}