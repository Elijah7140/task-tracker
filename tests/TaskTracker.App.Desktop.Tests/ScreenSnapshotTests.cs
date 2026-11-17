using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Styling;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Approved images of the principal application screens.</summary>
public sealed class ScreenSnapshotTests
{
    /// <summary>Tall enough to show a whole settings page or the whole item editor without scrolling.</summary>
    private const int TallWindowHeight = 1500;

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Search_with_filters_and_results_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedSearchableItemsAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.Text = "Review";
        page.IncludeCompleted = true;
        AddDueBetweenFilter(page, new DateOnly(2026, 11, 15), new DateOnly(2026, 12, 15));
        AddTitleContainsFilter(page, "invoice");
        await page.RunAsync();
        Assert.Equal(4, page.Results.Count);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"search-results-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Search_at_minimum_window_size_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedSearchableItemsAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, 600, 800);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.Text = "Review";
        page.IncludeCompleted = true;
        AddDueBetweenFilter(page, new DateOnly(2026, 11, 15), new DateOnly(2026, 12, 15));
        await page.RunAsync();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"search-narrow-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Search_with_an_invalid_range_and_an_invalid_number_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var effort = await services.GetRequiredService<FieldService>()
            .CreateAsync("Effort", FieldDataType.Number, project.Id);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.OpenProjectAsync(project.Id);
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        var range = AddNumberFilter(page, effort.Key, FilterOperator.Between);
        range.FirstText = "5";
        range.SecondText = "1";
        var invalid = AddNumberFilter(page, effort.Key, FilterOperator.Equals);
        invalid.FirstText = "twelve";
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(range.ValueError);
        Assert.NotNull(invalid.ValueError);
        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"search-error-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Search_empty_state_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.Text = "missing";
        await page.RunAsync();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"search-empty-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Home_with_projects_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var projects = services.GetRequiredService<ProjectService>();
        await projects.CreateAsync("Billing DB");
        await projects.CreateAsync("Website refresh");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);

        await shell.GoHomeAsync();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"home-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Workspace_with_items_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var (projectId, parentId) = await SeedWorkspaceAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, TallWindowHeight);

        await shell.OpenProjectAsync(projectId);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        var parentRow = page.OpenItems.Single(row => row.Id == parentId);
        parentRow.IsExpanded = true;
        await page.SelectItemAsync(parentRow);
        page.IsCompletedExpanded = true;
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"workspace-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task App_settings_match_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedGlobalFieldsAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, TallWindowHeight);

        await shell.OpenAppSettingsAsync();
        var page = Assert.IsType<AppSettingsViewModel>(shell.CurrentPage);
        page.CustomFields!.Rows.Single(row => row.Name == "Status").Choices!.IsExpanded = true;
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"app-settings-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Project_settings_match_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        await SeedGlobalFieldsAsync(services);
        await SeedProjectFieldsAsync(services, project.Id);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, TallWindowHeight);

        await shell.OpenProjectSettingsAsync(project.Id);
        var page = Assert.IsType<ProjectSettingsViewModel>(shell.CurrentPage);
        page.CustomFields!.Rows.Single(row => row.Name == "Risk level").Choices!.IsExpanded = true;
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"project-settings-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Workspace_with_an_invalid_custom_number_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var (projectId, parentId) = await SeedWorkspaceAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, TallWindowHeight);
        await shell.OpenProjectAsync(projectId);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        var parentRow = page.OpenItems.Single(row => row.Id == parentId);
        parentRow.IsExpanded = true;
        await page.SelectItemAsync(parentRow);
        page.IsCompletedExpanded = true;

        page.Editor!.CustomFields.OfType<NumberFieldInputViewModel>().Single().Text = "twelve";
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"workspace-invalid-number-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Field_manager_with_archived_items_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedFieldsWithArchivedItemsAsync(services);
        var manager = new FieldManagerViewModel(services.GetRequiredService<FieldService>(),
            services.GetRequiredService<IDialogService>(), null);
        await manager.LoadAsync();
        await manager.SetShowArchivedCommand.ExecuteAsync(true);
        manager.Rows.Single(row => row.Name == "Status").Choices!.IsExpanded = true;
        Application.Current!.RequestedThemeVariant = dark ? ThemeVariant.Dark : ThemeVariant.Light;
        var window = new Window { Content = new FieldManagerView { DataContext = manager }, Width = 900, Height = 640 };

        window.Show();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"field-manager-archived-{ThemeName(dark)}");
        window.Close();
    }

    private static async Task<(Guid ProjectId, Guid ParentId)> SeedWorkspaceAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var folders = services.GetRequiredService<FolderService>();
        var schema = await folders.CreateAsync(project.Id, null, "dbo");
        await folders.CreateAsync(project.Id, schema.Id, "Tables");
        var items = services.GetRequiredService<ItemService>();
        var parent = await items.CreateAsync(project.Id, null, null, "Review invoice indexes");
        var child = await items.CreateAsync(project.Id, null, parent.Id, "Check query plan");
        var immediate = await items.CreateAsync(project.Id, null, null, "Review migration");
        var approaching = await items.CreateAsync(project.Id, null, null, "Prepare release notes");
        var finished = await items.CreateAsync(project.Id, null, null, "Schema review complete");
        var lookups = services.GetRequiredService<LookupService>();
        var change = (await lookups.ItemTypesAsync()).Single(type => type.Name == "Change");
        var high = (await lookups.PriorityLevelsAsync()).Single(level => level.Name == "High");
        // The selected item fills every date and time field, built-in and custom: empty pickers
        // show today's date and AM/PM, which would make the image depend on when the test runs.
        var customFields = await CreateCustomFieldsAsync(services);
        await items.EditAsync(parent.Id, new ItemEdit(parent.Title, null, null, null, null,
            new DateOnly(2026, 11, 20), new TimeOnly(9, 30),
            new DateTime(2026, 11, 16, 9, 0, 0), new DateTime(2026, 11, 16, 11, 0, 0)),
            customFields.Values);
        await services.GetRequiredService<FieldService>().ArchiveAsync(customFields.ArchivedFieldId);
        await items.EditAsync(child.Id, new ItemEdit(child.Title, null, "DB-120", change.Id,
            high.Id, new DateOnly(2026, 11, 12), null, null, null));
        await items.EditAsync(immediate.Id, new ItemEdit(immediate.Title, null, "DB-121", change.Id,
            high.Id, new DateOnly(2026, 11, 13), null, null, null));
        await items.EditAsync(approaching.Id, new ItemEdit(approaching.Title, null, null, null,
            null, new DateOnly(2026, 11, 15), null, null, null));
        await items.SetCompletedAsync(project.Id, null, finished.Id, true);
        return (project.Id, parent.Id);
    }

    /// <summary>
    /// Creates one global field of each type plus one that the caller archives once its value is stored,
    /// and returns a value for each.
    /// </summary>
    private static async Task<CustomFieldSeed> CreateCustomFieldsAsync(IServiceProvider services)
    {
        var fields = services.GetRequiredService<FieldService>();
        var summary = await fields.CreateAsync("Summary", FieldDataType.Text, null);
        var effort = await fields.CreateAsync("Effort", FieldDataType.Number, null);
        var review = await fields.CreateAsync("Review date", FieldDataType.Date, null);
        var approved = await fields.CreateAsync("Approved", FieldDataType.Boolean, null);
        var status = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        var ready = await fields.AddChoiceAsync(status.Id, "Ready");
        var legacy = await fields.CreateAsync("Legacy reference", FieldDataType.Text, null);
        var values = new FieldValueInput[]
        {
            new(summary.Id, TextValue: "Check query cost"),
            new(effort.Id, NumberValue: 3.5),
            new(review.Id, DateValue: new DateOnly(2026, 11, 19)),
            new(approved.Id, BoolValue: true),
            new(status.Id, ChoiceId: ready.Id),
            new(legacy.Id, TextValue: "INV-2041")
        };

        return new CustomFieldSeed(values, legacy.Id);
    }

    private sealed record CustomFieldSeed(FieldValueInput[] Values, Guid ArchivedFieldId);

    private static async Task SeedGlobalFieldsAsync(IServiceProvider services)
    {
        var fields = services.GetRequiredService<FieldService>();
        await fields.CreateAsync("Summary", FieldDataType.Text, null);
        await fields.CreateAsync("Effort", FieldDataType.Number, null);
        await fields.CreateAsync("Review date", FieldDataType.Date, null);
        await fields.CreateAsync("Approved", FieldDataType.Boolean, null);
        var status = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        await fields.AddChoiceAsync(status.Id, "Ready");
        await fields.AddChoiceAsync(status.Id, "Blocked");
    }

    /// <summary>One archived field, and a choice field that has an archived choice.</summary>
    private static async Task SeedFieldsWithArchivedItemsAsync(IServiceProvider services)
    {
        var fields = services.GetRequiredService<FieldService>();
        await fields.CreateAsync("Summary", FieldDataType.Text, null);
        await fields.CreateAsync("Effort", FieldDataType.Number, null);
        var legacy = await fields.CreateAsync("Legacy reference", FieldDataType.Text, null);
        var status = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        await fields.AddChoiceAsync(status.Id, "Ready");
        await fields.AddChoiceAsync(status.Id, "Blocked");
        var retired = await fields.AddChoiceAsync(status.Id, "Retired");
        await fields.ArchiveAsync(legacy.Id);
        await fields.ArchiveChoiceAsync(status.Id, retired.Id);
    }

    private static async Task SeedProjectFieldsAsync(IServiceProvider services, Guid projectId)
    {
        var fields = services.GetRequiredService<FieldService>();
        await fields.CreateAsync("Project note", FieldDataType.Text, projectId);
        var risk = await fields.CreateAsync("Risk level", FieldDataType.Choice, projectId);
        await fields.AddChoiceAsync(risk.Id, "Low");
        await fields.AddChoiceAsync(risk.Id, "High");
    }

    private static async Task SeedSearchableItemsAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var folders = services.GetRequiredService<FolderService>();
        var dbo = await folders.CreateAsync(project.Id, null, "dbo");
        var tables = await folders.CreateAsync(project.Id, dbo.Id, "Tables");
        var items = services.GetRequiredService<ItemService>();
        var lookups = services.GetRequiredService<LookupService>();
        var types = await lookups.ItemTypesAsync();
        var priorities = await lookups.PriorityLevelsAsync();
        var change = types.Single(type => type.Name == "Change").Id;
        var error = types.Single(type => type.Name == "Error").Id;
        var high = priorities.Single(level => level.Name == "High").Id;
        var medium = priorities.Single(level => level.Name == "Medium").Id;
        var low = priorities.Single(level => level.Name == "Low").Id;
        var indexes = await items.CreateAsync(project.Id, tables.Id, null, "Review invoice indexes");
        var archive = await items.CreateAsync(project.Id, dbo.Id, null, "Review invoice archive");
        var finished = await items.CreateAsync(project.Id, null, null, "Review completed invoice");
        var longTitle = await items.CreateAsync(project.Id, null, null,
            "Review invoice reconciliation job with a very long title that has to be trimmed at the column edge");
        await items.EditAsync(indexes.Id, new ItemEdit(indexes.Title, null, "DB-101", change, high,
            new DateOnly(2026, 11, 20), new TimeOnly(14, 30), null, null));
        await items.EditAsync(archive.Id, new ItemEdit(archive.Title, null, "DB-102", error, medium,
            new DateOnly(2026, 11, 25), null, null, null));
        await items.EditAsync(finished.Id, new ItemEdit(finished.Title, null, "DB-99", change, high,
            new DateOnly(2026, 12, 1), null, null, null));
        await items.EditAsync(longTitle.Id, new ItemEdit(longTitle.Title, null, null, null, low,
            new DateOnly(2026, 12, 10), null, null, null));
        await items.SetCompletedAsync(project.Id, null, finished.Id, true);
    }

    private static void AddDueBetweenFilter(SearchViewModel page, DateOnly first, DateOnly second)
    {
        page.AddFilterCommand.Execute(null);
        var row = page.Filters[^1];
        row.SelectedField = row.Fields.Single(field => field.Key == "due");
        row.SelectedOperator = row.Operators.Single(option => option.Operator == FilterOperator.Between);
        row.FirstDate = new DateTimeOffset(first.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        row.SecondDate = new DateTimeOffset(second.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
    }

    private static void AddTitleContainsFilter(SearchViewModel page, string text)
    {
        page.AddFilterCommand.Execute(null);
        var row = page.Filters[^1];
        row.SelectedField = row.Fields.Single(field => field.Key == "title");
        row.SelectedOperator = row.Operators.Single(option => option.Operator == FilterOperator.Contains);
        row.FirstText = text;
    }

    private static SearchFilterRowViewModel AddNumberFilter(
        SearchViewModel page, string fieldKey, FilterOperator operation)
    {
        page.AddFilterCommand.Execute(null);
        var row = page.Filters[^1];
        row.SelectedField = row.Fields.Single(field => field.Key == fieldKey);
        row.SelectedOperator = row.Operators.Single(option => option.Operator == operation);
        return row;
    }

    private static MainWindow OpenWindow(MainWindowViewModel shell, bool dark, int height = 800, int width = 1200)
    {
        Application.Current!.RequestedThemeVariant = dark ? ThemeVariant.Dark : ThemeVariant.Light;
        var window = new MainWindow { DataContext = shell, Width = width, Height = height };
        window.Show();
        return window;
    }

    private static string ThemeName(bool dark)
    {
        return dark ? "dark" : "light";
    }
}