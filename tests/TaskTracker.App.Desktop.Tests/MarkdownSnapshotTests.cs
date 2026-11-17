using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Threading;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Approved images of the Markdown description preview and the Links section (§7.10).</summary>
public sealed class MarkdownSnapshotTests
{
    private const int EditorWindowHeight = 2000;

    private const string Description =
        "# Index review\n\n" +
        "Check the **query plan** and the *before/after* numbers, then run `EXPLAIN` again.\n" +
        "Second line of the same paragraph.\n\n" +
        "## Steps\n\n" +
        "1. Capture the plan\n2. Add the index\n3. Compare\n\n" +
        "- [x] Plan captured\n- [ ] Index added\n\n" +
        "> Remember to ask the DBA first.\n\n" +
        "```sql\nCREATE INDEX IX_Invoice_Customer\n  ON Invoice (CustomerId);\n```\n\n" +
        "---\n\n" +
        "See [the runbook](https://wiki.example.com/runbook) or [local file](file:///C:/notes.txt).\n\n" +
        "![diagram](https://wiki.example.com/plan.png) <b>raw html</b>";

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Editor_with_a_markdown_preview_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync(linkLauncher: new FakeLinkLauncher());
        var projectId = await SeedAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark, EditorWindowHeight);
        await shell.OpenProjectAsync(projectId);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await page.SelectItemAsync(Assert.Single(page.OpenItems));
        page.Editor!.ShowPreviewCommand.Execute(null);
        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"editor-markdown-preview-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Editor_with_a_links_section_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync(linkLauncher: new FakeLinkLauncher());
        var projectId = await SeedAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark, EditorWindowHeight);
        await shell.OpenProjectAsync(projectId);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await page.SelectItemAsync(Assert.Single(page.OpenItems));
        page.Editor!.Links.NewUrl = "ftp://example.com";
        page.Editor.Links.SubmitCommand.Execute(null);
        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"editor-links-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    private static async Task<Guid> SeedAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, "Add index to Invoice.CustomerId");
        var edit = new ItemEdit(item.Title, Description, "DB-101", null, null, null, null, null, null);
        ItemLinkInput[] links =
        [
            new(null, "https://wiki.example.com/runbook", "Index runbook"),
            new(null, "https://tracker.example.com/browse/DB-101", null),
            new(null, "mailto:dba-team@example.com", "Ask the DBA team")
        ];
        await items.EditAsync(item.Id, edit, [], links);

        return project.Id;
    }
}