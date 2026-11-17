using Avalonia;
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
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Drives the description preview and the Links section of the item editor with simulated input.</summary>
public sealed class MarkdownEditorViewTests
{
    private const string ItemTitle = "Document the schema";
    private const string DocsDescription = "# Plan\n\nRead the [docs](https://example.com/docs) first.";

    [AvaloniaFact]
    public async Task Preview_tab_replaces_the_text_box_with_the_rendered_description()
    {
        var launcher = new FakeLinkLauncher();
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: launcher);
        var seeded = await SeedAsync(services, DocsDescription);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorDescriptionPreviewTab"));

        Assert.Empty(HeadlessInput.FindAll<TextBox>(view, "EditorDescriptionBox"));
        HeadlessInput.Find<Border>(view, "EditorDescriptionPreview");
        var link = HeadlessInput.Find<Button>(view, "MarkdownLink");
        Assert.Equal("docs", Avalonia.Automation.AutomationProperties.GetName(link));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Edit_tab_brings_the_text_box_back_with_the_unchanged_text()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: new FakeLinkLauncher());
        var seeded = await SeedAsync(services, DocsDescription);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorDescriptionPreviewTab"));

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorDescriptionEditTab"));

        var box = HeadlessInput.Find<TextBox>(view, "EditorDescriptionBox");
        Assert.Equal(DocsDescription, box.Text);
        Assert.Empty(HeadlessInput.FindAll<Border>(view, "EditorDescriptionPreview"));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Clicking_a_link_in_the_preview_hands_its_address_to_the_launcher()
    {
        var launcher = new FakeLinkLauncher();
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: launcher);
        var seeded = await SeedAsync(services, DocsDescription);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorDescriptionPreviewTab"));

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "MarkdownLink"));
        await HeadlessInput.WaitUntilAsync(() => launcher.Launched.Count == 1);

        Assert.Equal(new Uri("https://example.com/docs"), launcher.Launched.Single());
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_link_with_a_blocked_scheme_is_shown_but_cannot_be_clicked()
    {
        var launcher = new FakeLinkLauncher();
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: launcher);
        var seeded = await SeedAsync(services, "Open [secrets](file:///C:/secrets.txt) now");
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorDescriptionPreviewTab"));

        Assert.Empty(HeadlessInput.FindAll<Button>(view, "MarkdownLink"));
        Assert.Contains("secrets (file:///C:/secrets.txt) now", PreviewText(view));
        Assert.Empty(launcher.Launched);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Task_list_boxes_in_the_preview_show_their_state_and_ignore_clicks()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: new FakeLinkLauncher());
        var seeded = await SeedAsync(services, "- [x] done\n- [ ] todo");
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorDescriptionPreviewTab"));

        var boxes = HeadlessInput.FindAll<CheckBox>(view, "MarkdownTaskCheckBox");
        HeadlessInput.Click(window, boxes[1]);

        Assert.Equal([true, false], boxes.Select(box => box.IsChecked == true));
        var editor = Assert.IsType<ProjectWorkspaceViewModel>(window.DataContext is MainWindowViewModel shell
            ? shell.CurrentPage : null).Editor!;
        Assert.Equal("- [x] done\n- [ ] todo", editor.Description);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_long_code_line_wraps_inside_the_preview_instead_of_being_clipped()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: new FakeLinkLauncher());
        var code = "```\nCREATE INDEX IX_Invoice_CustomerId_With_A_Very_Long_Name\n  ON Invoice (CustomerId);\n```";
        var seeded = await SeedAsync(services, code);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorDescriptionPreviewTab"));
        Dispatcher.UIThread.RunJobs();

        var preview = HeadlessInput.Find<Border>(view, "EditorDescriptionPreview");
        var codeText = preview.GetVisualDescendants().OfType<TextBlock>()
            .Single(text => text.Text?.Contains("CREATE INDEX") == true);
        Assert.Empty(preview.GetVisualDescendants().OfType<ScrollViewer>());
        Assert.True(RightEdgeIn(preview, codeText) <= preview.Bounds.Width + 0.5);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_task_list_box_lines_up_with_the_first_line_of_its_text()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: new FakeLinkLauncher());
        var seeded = await SeedAsync(services, "- [x] done\n- [ ] todo");
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorDescriptionPreviewTab"));
        Dispatcher.UIThread.RunJobs();

        var preview = HeadlessInput.Find<Border>(view, "EditorDescriptionPreview");
        var box = HeadlessInput.FindAll<CheckBox>(view, "MarkdownTaskCheckBox")[0];
        var drawnBox = box.GetVisualDescendants().OfType<Border>().Single(part => part.Name == "NormalRectangle");
        var row = (Grid)box.Parent!;
        var text = row.Children.Single(child => Grid.GetColumn(child) == 1).GetVisualDescendants()
            .OfType<TextBlock>().First();
        var boxCentre = TopIn(preview, drawnBox) + (drawnBox.Bounds.Height / 2);
        var lineCentre = TopIn(preview, text) + (text.Bounds.Height / 2);
        Assert.InRange(boxCentre - lineCentre, -2, 2);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Adding_a_link_and_saving_stores_it_on_the_item()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: new FakeLinkLauncher());
        var seeded = await SeedAsync(services, null);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        AddLink(window, view, "https://example.com/spec", "Spec");
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorSaveButton"));

        var stored = await services.GetRequiredService<ItemService>().LoadLinksAsync(seeded.ItemId);
        var link = Assert.Single(stored);
        Assert.Equal("https://example.com/spec", link.Url);
        Assert.Equal("Spec", link.Title);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(null)]
    [InlineData("Spec")]
    public async Task Pressing_Enter_in_either_link_box_adds_the_link(string? title)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: new FakeLinkLauncher());
        var seeded = await SeedAsync(services, null);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(view, "EditorLinkUrlBox"), "https://example.com/a");

        if (title is not null)
        {
            HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(view, "EditorLinkTitleBox"), title);
        }

        HeadlessInput.Press(window, Key.Enter);

        var link = HeadlessInput.Find<Button>(view, "EditorLinkOpenButton");
        Assert.Equal(title ?? "https://example.com/a", Avalonia.Automation.AutomationProperties.GetName(link));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Clicking_Edit_keeps_pending_link_text_and_shows_how_to_continue()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: new FakeLinkLauncher());
        var seeded = await SeedAsync(services, null, ("https://existing.example", null));
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        var address = HeadlessInput.Find<TextBox>(view, "EditorLinkUrlBox");
        HeadlessInput.TypeInto(window, address, "https://pending.example");
        var edit = HeadlessInput.Find<Button>(view, "EditorLinkEditButton");

        HeadlessInput.Click(window, edit);

        Assert.Equal("https://pending.example", address.Text);
        var error = HeadlessInput.Find<TextBlock>(view, "EditorLinkError");
        Assert.Equal("Finish or cancel the link you're editing first.", error.Text);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorLinkCancelButton"));
        HeadlessInput.Click(window, edit);
        Assert.Equal("https://existing.example", address.Text);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_file_address_shows_a_message_and_adds_nothing()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: new FakeLinkLauncher());
        var seeded = await SeedAsync(services, null);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        AddLink(window, view, "file:///C:/secrets.txt", null);

        var error = HeadlessInput.Find<TextBlock>(view, "EditorLinkError");
        Assert.Equal("A link must be a full http, https or mailto address.", error.Text);
        Assert.Empty(HeadlessInput.FindAll<Button>(view, "EditorLinkOpenButton"));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Removing_a_link_and_saving_deletes_it()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: new FakeLinkLauncher());
        var seeded = await SeedAsync(services, null, ("https://a.example", null), ("https://b.example", "Bee"));
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        HeadlessInput.Click(window, HeadlessInput.FindAll<Button>(view, "EditorLinkRemoveButton")[0]);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorSaveButton"));

        var stored = await services.GetRequiredService<ItemService>().LoadLinksAsync(seeded.ItemId);
        Assert.Equal(["https://b.example"], stored.Select(link => link.Url));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Moving_a_link_down_and_saving_keeps_the_new_order()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: new FakeLinkLauncher());
        var seeded = await SeedAsync(services, null, ("https://a.example", null), ("https://b.example", null));
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        HeadlessInput.Click(window, HeadlessInput.FindAll<Button>(view, "EditorLinkMoveDownButton")[0]);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorSaveButton"));

        var stored = await services.GetRequiredService<ItemService>().LoadLinksAsync(seeded.ItemId);
        Assert.Equal(["https://b.example", "https://a.example"], stored.Select(link => link.Url));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Editing_a_link_changes_its_address_when_updated_and_saved()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: new FakeLinkLauncher());
        var seeded = await SeedAsync(services, null, ("https://a.example", null));
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorLinkEditButton"));
        var address = HeadlessInput.Find<TextBox>(view, "EditorLinkUrlBox");
        HeadlessInput.Click(window, address);
        HeadlessInput.Press(window, Key.A, RawInputModifiers.Control);
        window.KeyTextInput("https://changed.example");
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorLinkSubmitButton"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorSaveButton"));

        var stored = await services.GetRequiredService<ItemService>().LoadLinksAsync(seeded.ItemId);
        Assert.Equal("https://changed.example", Assert.Single(stored).Url);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Revert_drops_added_links_and_restores_removed_ones()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: new FakeLinkLauncher());
        var seeded = await SeedAsync(services, null, ("https://a.example", null));
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorLinkRemoveButton"));
        AddLink(window, view, "https://new.example", null);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorRevertButton"));

        var rows = HeadlessInput.FindAll<Button>(view, "EditorLinkOpenButton");
        Assert.Equal(["https://a.example"], rows.Select(row => Avalonia.Automation.AutomationProperties.GetName(row)));
        var stored = await services.GetRequiredService<ItemService>().LoadLinksAsync(seeded.ItemId);
        Assert.Equal(["https://a.example"], stored.Select(link => link.Url));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Opening_a_listed_link_hands_its_address_to_the_launcher()
    {
        var launcher = new FakeLinkLauncher();
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window, linkLauncher: launcher);
        var seeded = await SeedAsync(services, null, ("mailto:team@example.com", "Team"));
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        var link = HeadlessInput.Find<Button>(view, "EditorLinkOpenButton");
        Assert.Equal("mailto:team@example.com", ToolTip.GetTip(link));
        HeadlessInput.Click(window, link);
        await HeadlessInput.WaitUntilAsync(() => launcher.Launched.Count == 1);

        Assert.Equal(new Uri("mailto:team@example.com"), launcher.Launched.Single());
        window.Close();
    }

    /// <summary>The text of every run shown in the preview, joined in order.</summary>
    private static string PreviewText(ProjectWorkspaceView view)
    {
        var preview = HeadlessInput.Find<Border>(view, "EditorDescriptionPreview");
        var runs = preview.GetVisualDescendants().OfType<TextBlock>()
            .SelectMany(text => text.Inlines ?? [])
            .SelectMany(FlattenRuns);

        return string.Concat(runs);
    }

    private static double TopIn(Visual root, Visual control)
    {
        return control.TranslatePoint(new Point(0, 0), root)!.Value.Y;
    }

    private static double RightEdgeIn(Visual root, Control control)
    {
        return control.TranslatePoint(new Point(control.Bounds.Width, 0), root)!.Value.X;
    }

    private static IEnumerable<string> FlattenRuns(Avalonia.Controls.Documents.Inline inline)
    {
        if (inline is Avalonia.Controls.Documents.Run run)
        {
            return [run.Text ?? string.Empty];
        }

        if (inline is Avalonia.Controls.Documents.Span span)
        {
            return span.Inlines.SelectMany(FlattenRuns);
        }

        return [];
    }

    private static void AddLink(MainWindow window, ProjectWorkspaceView view, string url, string? title)
    {
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(view, "EditorLinkUrlBox"), url);

        if (title is not null)
        {
            HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(view, "EditorLinkTitleBox"), title);
        }

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorLinkSubmitButton"));
    }

    private static async Task<ProjectWorkspaceView> OpenItemAsync(MainWindow window, IServiceProvider services,
        Guid projectId)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenProjectAsync(projectId);
        Dispatcher.UIThread.RunJobs();
        var title = window.GetVisualDescendants().OfType<Button>()
            .First(control => control.IsEffectivelyVisible && control.Content is TextBlock text && text.Text == ItemTitle);
        HeadlessInput.Click(window, title);

        return window.GetVisualDescendants().OfType<ProjectWorkspaceView>().Single();
    }

    private static async Task<Seeded> SeedAsync(IServiceProvider services, string? description,
        params (string Url, string? Title)[] links)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, ItemTitle);
        var edit = new ItemEdit(ItemTitle, description, null, null, null, null, null, null, null);
        var inputs = links.Select(link => new ItemLinkInput(null, link.Url, link.Title)).ToList();
        await items.EditAsync(item.Id, edit, [], inputs);

        return new Seeded(project.Id, item.Id);
    }

    private sealed record Seeded(Guid ProjectId, Guid ItemId);
}