using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Threading;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Approved images of the query syntax, the help popup and saved searches.</summary>
public sealed class SavedSearchSnapshotTests
{
    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Search_with_a_parsed_query_rows_and_saved_searches_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.QueryText = "invoice type:change priority>=high due<2026-12-05";

        await page.SubmitAsync();
        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();

        Assert.Equal(3, page.Filters.Count);
        Assert.NotEmpty(page.Results);
        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"search-query-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Search_with_a_query_error_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.QueryText = "invoice tpye:change due<soon";

        await page.SubmitAsync();
        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(page.Error);
        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"search-query-error-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Search_help_popup_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SearchHelpButton"));
        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(HeadlessInput.Find<StackPanel>(window, "SearchHelpPanel"));
        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"search-help-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Home_with_saved_searches_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark);

        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"home-saved-searches-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    /// <summary>Opens a saved search so the page shows its chips with one selected.</summary>
    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Search_opened_from_a_saved_search_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedAsync(services);
        var saved = await services.GetRequiredService<SavedSearchService>().ListAsync();
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark);
        await shell.GoHomeAsync();

        await shell.OpenSavedSearchAsync(saved[1].Id);
        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"search-saved-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    private static async Task SeedAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        await SeedItemsAsync(services, project.Id);
        var service = services.GetRequiredService<SavedSearchService>();
        var all = new SearchScope.AllProjects();
        await service.SaveAsync("Overdue changes", new SavedSearchDefinition("type:Change due<today", all, false));
        var urgent = new SavedSearchDefinition("invoice priority>=High", new SearchScope.Project(project.Id), true);
        await service.SaveAsync("Urgent invoices", urgent);
        await service.SaveAsync("No ticket", new SavedSearchDefinition("no:ticket", all, false));
    }

    private static async Task SeedItemsAsync(IServiceProvider services, Guid projectId)
    {
        var items = services.GetRequiredService<ItemService>();
        var lookups = services.GetRequiredService<LookupService>();
        var types = await lookups.ItemTypesAsync();
        var priorities = await lookups.PriorityLevelsAsync();
        var change = types.Single(type => type.Name == "Change").Id;
        var high = priorities.Single(level => level.Name == "High").Id;
        var low = priorities.Single(level => level.Name == "Low").Id;
        var first = await items.CreateAsync(projectId, null, null, "Review invoice indexes");
        var second = await items.CreateAsync(projectId, null, null, "Archive old invoices");
        await items.EditAsync(first.Id, new ItemEdit(first.Title, null, "DB-101", change, high,
            new DateOnly(2026, 11, 20), null, null, null));
        await items.EditAsync(second.Id, new ItemEdit(second.Title, null, null, change, low,
            new DateOnly(2026, 11, 25), null, null, null));
    }
}