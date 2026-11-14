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
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Drives the item editor's custom field inputs with simulated mouse and keyboard input.</summary>
public sealed class CustomFieldsViewTests
{
    private const string ItemTitle = "Metadata item";

    [AvaloniaFact]
    public async Task Filling_one_field_of_each_type_and_saving_stores_every_value()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        FillEveryField(window, view);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorSaveButton"));

        var stored = await services.GetRequiredService<ItemService>().LoadFieldValuesAsync(seeded.ItemId);
        Assert.Equivalent(seeded.FilledValues, stored.Select(ToInput));
        window.Close();
    }

    [AvaloniaFact]
    public async Task The_saved_values_are_shown_after_reopening_the_item()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        FillEveryField(window, view);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorSaveButton"));

        GoHome(window);
        view = OpenItemFromHome(window);

        AssertEveryFieldShowsTheFilledValues(view);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Revert_puts_back_the_stored_custom_values()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        var text = HeadlessInput.FindNamed<TextBox>(view, "EditorCustomTextBox", "Summary");
        HeadlessInput.TypeInto(window, text, "unsaved");

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorRevertButton"));

        var restored = HeadlessInput.FindNamed<TextBox>(view, "EditorCustomTextBox", "Summary");
        Assert.Equal(string.Empty, restored.Text);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Revert_does_not_store_anything()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        var text = HeadlessInput.FindNamed<TextBox>(view, "EditorCustomTextBox", "Summary");
        HeadlessInput.TypeInto(window, text, "unsaved");

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorRevertButton"));

        var stored = await services.GetRequiredService<ItemService>().LoadFieldValuesAsync(seeded.ItemId);
        Assert.Empty(stored);
        window.Close();
    }

    [AvaloniaFact]
    public async Task An_invalid_number_shows_an_inline_message()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        var number = HeadlessInput.FindNamed<TextBox>(view, "EditorCustomNumberBox", "Effort");

        HeadlessInput.TypeInto(window, number, "twelve");

        var error = HeadlessInput.Find<TextBlock>(view, "EditorCustomNumberError");
        Assert.Equal("Enter a valid number.", error.Text);
    }

    [AvaloniaFact]
    public async Task An_invalid_number_disables_save()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        var number = HeadlessInput.FindNamed<TextBox>(view, "EditorCustomNumberBox", "Effort");

        HeadlessInput.TypeInto(window, number, "twelve");

        var save = HeadlessInput.Find<Button>(view, "EditorSaveButton");
        Assert.False(save.IsEffectivelyEnabled);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Fixing_the_number_hides_the_message_and_enables_save_again()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        var number = HeadlessInput.FindNamed<TextBox>(view, "EditorCustomNumberBox", "Effort");
        HeadlessInput.TypeInto(window, number, "twelve");

        HeadlessInput.Press(window, Key.A, RawInputModifiers.Control);
        window.KeyTextInput("12");
        Dispatcher.UIThread.RunJobs();

        var save = HeadlessInput.Find<Button>(view, "EditorSaveButton");
        Assert.Empty(HeadlessInput.FindAll<TextBlock>(view, "EditorCustomNumberError"));
        Assert.True(save.IsEffectivelyEnabled);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Leaving_an_item_with_a_changed_custom_value_asks_what_to_do_with_the_draft()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services);
        await services.GetRequiredService<ItemService>().CreateAsync(seeded.ProjectId, null, null, "Other item");
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        var text = HeadlessInput.FindNamed<TextBox>(view, "EditorCustomTextBox", "Summary");
        HeadlessInput.TypeInto(window, text, "unsaved");

        ClickTitle(window, "Other item");

        Assert.Single(window.OwnedWindows);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Cancelling_the_draft_prompt_keeps_the_typed_custom_value()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services);
        await services.GetRequiredService<ItemService>().CreateAsync(seeded.ProjectId, null, null, "Other item");
        var view = await OpenItemAsync(window, services, seeded.ProjectId);
        var text = HeadlessInput.FindNamed<TextBox>(view, "EditorCustomTextBox", "Summary");
        HeadlessInput.TypeInto(window, text, "unsaved");
        ClickTitle(window, "Other item");

        HeadlessInput.Press(Assert.Single(window.OwnedWindows), Key.Escape);

        var page = Assert.IsType<ProjectWorkspaceViewModel>(services.GetRequiredService<MainWindowViewModel>().CurrentPage);
        var typed = HeadlessInput.FindNamed<TextBox>(view, "EditorCustomTextBox", "Summary");
        Assert.Equal(ItemTitle, page.Editor!.Title);
        Assert.Equal("unsaved", typed.Text);
        window.Close();
    }

    [AvaloniaFact]
    public async Task The_clear_button_removes_a_stored_date_when_saved()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services);
        await StoreAsync(services, seeded, new FieldValueInput(seeded.ReviewId, DateValue: new DateOnly(2026, 11, 19)));
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorCustomClearDateButton"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "EditorSaveButton"));

        var stored = await services.GetRequiredService<ItemService>().LoadFieldValuesAsync(seeded.ItemId);
        Assert.Empty(stored);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Archived_fields_are_listed_read_only_under_their_own_heading()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services);
        await StoreAsync(services, seeded, new FieldValueInput(seeded.SummaryId, TextValue: "kept value"));
        await services.GetRequiredService<FieldService>().ArchiveAsync(seeded.SummaryId);
        var view = await OpenItemAsync(window, services, seeded.ProjectId);

        var texts = view.GetVisualDescendants().OfType<TextBlock>()
            .Where(text => text.IsEffectivelyVisible).Select(text => text.Text).ToList();

        Assert.Contains("Archived fields", texts);
        Assert.Contains("kept value", texts);
        Assert.Empty(HeadlessInput.FindAll<TextBox>(view, "EditorCustomTextBox"));
        window.Close();
    }

    private static void FillEveryField(MainWindow window, ProjectWorkspaceView view)
    {
        HeadlessInput.TypeInto(window, HeadlessInput.FindNamed<TextBox>(view, "EditorCustomTextBox", "Summary"), "Check cost");
        HeadlessInput.TypeInto(window, HeadlessInput.FindNamed<TextBox>(view, "EditorCustomNumberBox", "Effort"), "3.5");
        var picker = HeadlessInput.FindNamed<CalendarDatePicker>(view, "EditorCustomDatePicker", "Review date");
        HeadlessInput.TypeInto(window, picker.GetVisualDescendants().OfType<TextBox>().First(), "11/19/2026");
        HeadlessInput.Press(window, Key.Enter);
        HeadlessInput.ChooseEntry(window, HeadlessInput.FindNamed<ComboBox>(view, "EditorCustomBooleanBox", "Approved"), 1);
        HeadlessInput.ChooseEntry(window, HeadlessInput.FindNamed<ComboBox>(view, "EditorCustomChoiceBox", "Status"), 1);
    }

    private static void AssertEveryFieldShowsTheFilledValues(ProjectWorkspaceView view)
    {
        var text = HeadlessInput.FindNamed<TextBox>(view, "EditorCustomTextBox", "Summary");
        var number = HeadlessInput.FindNamed<TextBox>(view, "EditorCustomNumberBox", "Effort");
        var picker = HeadlessInput.FindNamed<CalendarDatePicker>(view, "EditorCustomDatePicker", "Review date");
        var approved = HeadlessInput.FindNamed<ComboBox>(view, "EditorCustomBooleanBox", "Approved");
        var status = HeadlessInput.FindNamed<ComboBox>(view, "EditorCustomChoiceBox", "Status");

        Assert.Equal("Check cost", text.Text);
        Assert.Equal("3.5", number.Text);
        Assert.Equal(new DateTime(2026, 11, 19), picker.SelectedDate);
        Assert.Equal("Yes", approved.SelectedItem?.ToString());
        Assert.Equal("Ready", status.SelectedItem?.ToString());
    }

    private static void GoHome(MainWindow window)
    {
        var home = window.GetVisualDescendants().OfType<Button>()
            .Single(button => button.IsEffectivelyVisible && button.Content is string text && text == "Home");
        HeadlessInput.Click(window, home);
    }

    private static ProjectWorkspaceView OpenItemFromHome(MainWindow window)
    {
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "OpenProjectButton"));
        ClickTitle(window, ItemTitle);

        return window.GetVisualDescendants().OfType<ProjectWorkspaceView>().Single();
    }

    private static async Task<ProjectWorkspaceView> OpenItemAsync(MainWindow window, IServiceProvider services,
        Guid projectId)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenProjectAsync(projectId);
        Dispatcher.UIThread.RunJobs();
        ClickTitle(window, ItemTitle);

        return window.GetVisualDescendants().OfType<ProjectWorkspaceView>().Single();
    }

    private static void ClickTitle(Window window, string title)
    {
        var button = window.GetVisualDescendants().OfType<Button>()
            .First(control => control.IsEffectivelyVisible &&
                control.Content is TextBlock text && text.Text == title);
        HeadlessInput.Click(window, button);
    }

    private static async Task StoreAsync(IServiceProvider services, SeededFields seeded, FieldValueInput value)
    {
        var items = services.GetRequiredService<ItemService>();
        var edit = new ItemEdit(ItemTitle, null, null, null, null, null, null, null, null);
        await items.EditAsync(seeded.ItemId, edit, [value]);
    }

    private static FieldValueInput ToInput(ItemFieldValue value)
    {
        return new FieldValueInput(value.FieldDefinitionId, value.TextValue, value.NumberValue,
            value.DateValue, value.BoolValue, value.ChoiceId);
    }

    private static async Task<SeededFields> SeedAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var item = await services.GetRequiredService<ItemService>().CreateAsync(project.Id, null, null, ItemTitle);
        var fields = services.GetRequiredService<FieldService>();
        var summary = await fields.CreateAsync("Summary", FieldDataType.Text, null);
        var effort = await fields.CreateAsync("Effort", FieldDataType.Number, null);
        var review = await fields.CreateAsync("Review date", FieldDataType.Date, null);
        var approved = await fields.CreateAsync("Approved", FieldDataType.Boolean, null);
        var status = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        var ready = await fields.AddChoiceAsync(status.Id, "Ready");
        FieldValueInput[] filled =
        [
            new(summary.Id, TextValue: "Check cost"),
            new(effort.Id, NumberValue: 3.5),
            new(review.Id, DateValue: new DateOnly(2026, 11, 19)),
            new(approved.Id, BoolValue: true),
            new(status.Id, ChoiceId: ready.Id)
        ];

        return new SeededFields(project.Id, item.Id, summary.Id, review.Id, filled);
    }

    // FilledValues is what the tests expect to be stored after typing a value into every input.
    private sealed record SeededFields(Guid ProjectId, Guid ItemId, Guid SummaryId, Guid ReviewId,
        FieldValueInput[] FilledValues);
}