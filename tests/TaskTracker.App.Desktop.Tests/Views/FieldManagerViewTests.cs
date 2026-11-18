using Avalonia.Controls;
using Avalonia.Controls.Primitives;
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
using TaskTracker.Core.Undo;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Drives the custom field manager with simulated mouse and keyboard input.</summary>
public sealed class FieldManagerViewTests
{
    [AvaloniaFact]
    public async Task Adding_a_field_of_each_type_saves_every_field()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var view = await OpenAppSettingsAsync(window, services);

        AddField(window, view, "Summary", pressEnter: true);
        AddFieldOfNextType(window, view, "Effort");
        AddFieldOfNextType(window, view, "Review date");
        AddFieldOfNextType(window, view, "Approved");
        AddFieldOfNextType(window, view, "Status");

        var saved = (await services.GetRequiredService<FieldService>().ListAllAsync(null))
            .OrderBy(field => field.SortOrder)
            .ToList();
        Assert.Equal(["Summary", "Effort", "Review date", "Approved", "Status"],
            saved.Select(field => field.DisplayName));
        Assert.Equal(
            [FieldDataType.Text, FieldDataType.Number, FieldDataType.Date, FieldDataType.Boolean, FieldDataType.Choice],
            saved.Select(field => field.DataType));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Adding_a_field_clears_the_name_box()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var view = await OpenAppSettingsAsync(window, services);

        AddField(window, view, "Summary", pressEnter: false);

        var nameBox = HeadlessInput.Find<TextBox>(view, "FieldNewNameBox");
        Assert.Equal(string.Empty, nameBox.Text);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_duplicate_field_name_shows_a_message()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await services.GetRequiredService<FieldService>().CreateAsync("Summary", FieldDataType.Text, null);
        var view = await OpenAppSettingsAsync(window, services);

        AddField(window, view, "summary", pressEnter: false);

        var dialog = Assert.Single(window.OwnedWindows);
        Assert.Equal("Field validation", dialog.Title);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_duplicate_field_name_stays_in_the_box_so_it_can_be_fixed()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await services.GetRequiredService<FieldService>().CreateAsync("Summary", FieldDataType.Text, null);
        var view = await OpenAppSettingsAsync(window, services);

        AddField(window, view, "summary", pressEnter: false);

        var nameBox = HeadlessInput.Find<TextBox>(view, "FieldNewNameBox");
        Assert.Equal("summary", nameBox.Text);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Typing_choices_adds_them_with_enter_and_with_the_add_button()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var fields = services.GetRequiredService<FieldService>();
        var status = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        var view = await OpenAppSettingsAsync(window, services);
        OpenChoicesPanel(window, view);

        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(view, "ChoiceNewLabelBox"), "Ready");
        HeadlessInput.Press(window, Key.Enter);
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(view, "ChoiceNewLabelBox"), "Blocked");
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "ChoiceAddButton"));

        var saved = await fields.ListChoicesAsync(status.Id);
        var choiceBox = HeadlessInput.Find<TextBox>(view, "ChoiceNewLabelBox");
        Assert.Equal(["Ready", "Blocked"], saved.OrderBy(choice => choice.SortOrder).Select(choice => choice.Label));
        Assert.Equal(string.Empty, choiceBox.Text);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Renaming_a_field_uses_the_typed_dialog_text()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var fields = services.GetRequiredService<FieldService>();
        await fields.CreateAsync("Status", FieldDataType.Choice, null);
        var view = await OpenAppSettingsAsync(window, services);

        HeadlessInput.Click(window, FieldButton(view, "FieldRenameButton", "Status"));
        TypeIntoDialog(window, "State");

        var saved = Assert.Single(await fields.ListAllAsync(null));
        Assert.Equal("State", saved.DisplayName);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Renaming_a_choice_uses_the_typed_dialog_text()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var fields = services.GetRequiredService<FieldService>();
        var status = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        await fields.AddChoiceAsync(status.Id, "Ready");
        var view = await OpenAppSettingsAsync(window, services);
        OpenChoicesPanel(window, view);

        HeadlessInput.Click(window, ChoiceButton(view, "ChoiceRenameButton", "Ready"));
        TypeIntoDialog(window, "Done");

        var saved = Assert.Single(await fields.ListChoicesAsync(status.Id));
        Assert.Equal("Done", saved.Label);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Archiving_a_field_removes_its_row()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await services.GetRequiredService<FieldService>().CreateAsync("Effort", FieldDataType.Number, null);
        var view = await OpenAppSettingsAsync(window, services);

        HeadlessInput.Click(window, FieldButton(view, "FieldArchiveButton", "Effort"));

        Assert.Empty(HeadlessInput.FindAll<ComboBox>(view, "FieldTypeBox"));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Archiving_a_field_saves_it_as_archived()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var fields = services.GetRequiredService<FieldService>();
        await fields.CreateAsync("Effort", FieldDataType.Number, null);
        var view = await OpenAppSettingsAsync(window, services);

        HeadlessInput.Click(window, FieldButton(view, "FieldArchiveButton", "Effort"));

        var saved = Assert.Single(await fields.ListAllAsync(null));
        Assert.True(saved.IsArchived);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Ticking_show_archived_lists_archived_fields_with_a_restore_button()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var fields = services.GetRequiredService<FieldService>();
        var effort = await fields.CreateAsync("Effort", FieldDataType.Number, null);
        await fields.ArchiveAsync(effort.Id);
        var view = await OpenAppSettingsAsync(window, services);

        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(view, "FieldShowArchivedCheckBox"));

        Assert.Single(HeadlessInput.FindAll<Button>(view, "FieldRestoreButton"));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Restore_makes_an_archived_field_active_again()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var fields = services.GetRequiredService<FieldService>();
        var effort = await fields.CreateAsync("Effort", FieldDataType.Number, null);
        await fields.ArchiveAsync(effort.Id);
        var view = await OpenAppSettingsAsync(window, services);
        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(view, "FieldShowArchivedCheckBox"));

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "FieldRestoreButton"));

        var saved = Assert.Single(await fields.ListAllAsync(null));
        Assert.False(saved.IsArchived);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Archiving_a_choice_saves_it_as_archived()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var fields = services.GetRequiredService<FieldService>();
        var status = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        await fields.AddChoiceAsync(status.Id, "Ready");
        var view = await OpenAppSettingsAsync(window, services);
        OpenChoicesPanel(window, view);

        HeadlessInput.Click(window, ChoiceButton(view, "ChoiceArchiveButton", "Ready"));

        var saved = Assert.Single(await fields.ListChoicesAsync(status.Id));
        Assert.True(saved.IsArchived);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Restoring_an_archived_choice_makes_it_active_again()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var fields = services.GetRequiredService<FieldService>();
        var status = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        var ready = await fields.AddChoiceAsync(status.Id, "Ready");
        await fields.ArchiveChoiceAsync(status.Id, ready.Id);
        var view = await OpenAppSettingsAsync(window, services);
        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(view, "FieldShowArchivedCheckBox"));
        OpenChoicesPanel(window, view);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "ChoiceRestoreButton"));

        var saved = Assert.Single(await fields.ListChoicesAsync(status.Id));
        Assert.False(saved.IsArchived);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Move_buttons_reorder_fields()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var fields = services.GetRequiredService<FieldService>();
        await fields.CreateAsync("First", FieldDataType.Text, null);
        await fields.CreateAsync("Second", FieldDataType.Text, null);
        var view = await OpenAppSettingsAsync(window, services);

        HeadlessInput.Click(window, FieldButton(view, "FieldMoveUpButton", "Second"));

        var saved = (await fields.ListAllAsync(null)).OrderBy(field => field.SortOrder);
        Assert.Equal(["Second", "First"], saved.Select(field => field.DisplayName));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Move_buttons_reorder_choices()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var fields = services.GetRequiredService<FieldService>();
        var status = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        await fields.AddChoiceAsync(status.Id, "One");
        await fields.AddChoiceAsync(status.Id, "Two");
        var view = await OpenAppSettingsAsync(window, services);
        OpenChoicesPanel(window, view);

        HeadlessInput.Click(window, ChoiceButton(view, "ChoiceMoveUpButton", "Two"));

        var saved = (await fields.ListChoicesAsync(status.Id)).OrderBy(choice => choice.SortOrder);
        Assert.Equal(["Two", "One"], saved.Select(choice => choice.Label));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Choosing_a_new_type_for_a_field_with_values_shows_the_service_message()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await SeedFieldWithValueAsync(services);
        var view = await OpenAppSettingsAsync(window, services);

        ChooseNextType(window, view);

        var dialog = Assert.Single(window.OwnedWindows);
        var texts = dialog.GetVisualDescendants().OfType<TextBlock>().Select(text => text.Text).ToList();
        Assert.Contains("A field with values cannot change type.", texts);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_refused_type_change_puts_the_saved_type_back_in_the_list()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await SeedFieldWithValueAsync(services);
        var view = await OpenAppSettingsAsync(window, services);
        ChooseNextType(window, view);

        HeadlessInput.Press(Assert.Single(window.OwnedWindows), Key.Enter);

        var typeBox = HeadlessInput.Find<ComboBox>(view, "FieldTypeBox");
        Assert.Equal(FieldDataType.Text, typeBox.SelectedItem);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Choosing_a_new_type_for_an_unused_field_saves_it()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var fields = services.GetRequiredService<FieldService>();
        await fields.CreateAsync("Effort", FieldDataType.Text, null);
        var view = await OpenAppSettingsAsync(window, services);

        ChooseNextType(window, view);

        var saved = Assert.Single(await fields.ListAllAsync(null));
        Assert.Equal(FieldDataType.Number, saved.DataType);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Pressing_down_twice_on_a_closed_type_box_applies_only_the_final_type(bool inProjectSettings)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var (view, field) = await OpenSettingsWithTextFieldAsync(window, services, inProjectSettings);
        HeadlessInput.Click(window, HeadlessInput.Find<ComboBox>(view, "FieldTypeBox"));
        HeadlessInput.Press(window, Key.Escape);

        HeadlessInput.Press(window, Key.Down);
        HeadlessInput.Press(window, Key.Down);
        var savedWhileBrowsing = await SavedTypeAsync(services, field);
        HeadlessInput.Press(window, Key.Enter);

        Assert.Equal(FieldDataType.Text, savedWhileBrowsing);
        Assert.Equal(FieldDataType.Date, await SavedTypeAsync(services, field));
        Assert.Equal(FieldDataType.Text, await TypeAfterOneUndoAsync(services, field));
        Assert.Empty(window.OwnedWindows);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Pressing_down_twice_in_an_open_type_box_applies_only_the_final_type(bool inProjectSettings)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var (view, field) = await OpenSettingsWithTextFieldAsync(window, services, inProjectSettings);
        HeadlessInput.Click(window, HeadlessInput.Find<ComboBox>(view, "FieldTypeBox"));

        HeadlessInput.Press(window, Key.Down);
        HeadlessInput.Press(window, Key.Down);
        var savedWhileBrowsing = await SavedTypeAsync(services, field);
        HeadlessInput.Press(window, Key.Enter);

        Assert.Equal(FieldDataType.Text, savedWhileBrowsing);
        Assert.Equal(FieldDataType.Date, await SavedTypeAsync(services, field));
        Assert.Equal(FieldDataType.Text, await TypeAfterOneUndoAsync(services, field));
        Assert.Empty(window.OwnedWindows);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(Key.Tab, FieldDataType.Date)]
    [InlineData(Key.Escape, FieldDataType.Text)]
    public async Task Tab_commits_a_browsed_type_and_escape_puts_the_saved_type_back(Key settleKey, FieldDataType expected)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var (view, field) = await OpenSettingsWithTextFieldAsync(window, services, inProjectSettings: false);
        var typeBox = HeadlessInput.Find<ComboBox>(view, "FieldTypeBox");
        HeadlessInput.Click(window, typeBox);
        HeadlessInput.Press(window, Key.Escape);

        HeadlessInput.Press(window, Key.Down);
        HeadlessInput.Press(window, Key.Down);
        HeadlessInput.Press(window, settleKey);

        Assert.Equal(expected, await SavedTypeAsync(services, field));
        Assert.Equal(expected, HeadlessInput.Find<ComboBox>(view, "FieldTypeBox").SelectedItem);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Browsing_the_type_box_of_a_field_with_values_shows_one_message_only_when_committed()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await SeedFieldWithValueAsync(services);
        var view = await OpenAppSettingsAsync(window, services);
        HeadlessInput.Click(window, HeadlessInput.Find<ComboBox>(view, "FieldTypeBox"));
        HeadlessInput.Press(window, Key.Escape);

        HeadlessInput.Press(window, Key.Down);
        HeadlessInput.Press(window, Key.Down);
        var messagesWhileBrowsing = window.OwnedWindows.Count;
        HeadlessInput.Press(window, Key.Enter);

        Assert.Equal(0, messagesWhileBrowsing);
        Assert.Single(window.OwnedWindows);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Choosing_choice_as_the_type_of_an_existing_field_opens_its_choices_panel()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await services.GetRequiredService<FieldService>().CreateAsync("Status", FieldDataType.Text, null);
        var view = await OpenAppSettingsAsync(window, services);

        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(view, "FieldTypeBox"), "Choice");

        var expander = HeadlessInput.Find<Expander>(view, "FieldChoicesExpander");
        Assert.True(expander.IsExpanded);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Project_settings_lists_inherited_fields()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        await services.GetRequiredService<FieldService>().CreateAsync("Effort", FieldDataType.Number, null);

        var view = await OpenProjectSettingsAsync(window, services, project.Id);

        var texts = view.GetVisualDescendants().OfType<TextBlock>().Select(text => text.Text).ToList();
        Assert.Contains("Global fields (inherited)", texts);
        Assert.Contains("Effort", texts);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Project_settings_adds_a_project_field_with_typed_input()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var fields = services.GetRequiredService<FieldService>();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var view = await OpenProjectSettingsAsync(window, services, project.Id);

        AddField(window, view, "Project note", pressEnter: true);

        var saved = Assert.Single(await fields.ListAllAsync(project.Id));
        Assert.Equal(project.Id, saved.ProjectId);
        window.Close();
    }

    private static async Task SeedFieldWithValueAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, "Task");
        var field = await services.GetRequiredService<FieldService>().CreateAsync("Effort", FieldDataType.Text, null);
        var edit = new ItemEdit(item.Title, null, null, null, null, null, null, null, null);
        await items.EditAsync(item.Id, edit, [new FieldValueInput(field.Id, TextValue: "big")]);
    }

    /// <summary>Creates a text field (global, or in a new project) and opens the settings page that manages it.</summary>
    private static async Task<(FieldManagerView View, FieldDefinition Field)> OpenSettingsWithTextFieldAsync(
        MainWindow window, IServiceProvider services, bool inProjectSettings)
    {
        var fields = services.GetRequiredService<FieldService>();

        if (!inProjectSettings)
        {
            var globalField = await fields.CreateAsync("Effort", FieldDataType.Text, null);
            return (await OpenAppSettingsAsync(window, services), globalField);
        }

        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var projectField = await fields.CreateAsync("Effort", FieldDataType.Text, project.Id);

        return (await OpenProjectSettingsAsync(window, services, project.Id), projectField);
    }

    private static async Task<FieldDataType> SavedTypeAsync(IServiceProvider services, FieldDefinition field)
    {
        var saved = await services.GetRequiredService<FieldService>().ListAllAsync(field.ProjectId);

        return saved.Single(candidate => candidate.Id == field.Id).DataType;
    }

    /// <summary>Undoes the last recorded step; one undo returns to Text only when a single type change was saved.</summary>
    private static async Task<FieldDataType> TypeAfterOneUndoAsync(IServiceProvider services, FieldDefinition field)
    {
        await services.GetRequiredService<UndoHistory>().UndoAsync();

        return await SavedTypeAsync(services, field);
    }

    private static async Task<FieldManagerView> OpenAppSettingsAsync(MainWindow window, IServiceProvider services)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenAppSettingsAsync();
        Dispatcher.UIThread.RunJobs();

        return window.GetVisualDescendants().OfType<FieldManagerView>().Single();
    }

    private static async Task<FieldManagerView> OpenProjectSettingsAsync(MainWindow window,
        IServiceProvider services, Guid projectId)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenProjectSettingsAsync(projectId);
        Dispatcher.UIThread.RunJobs();

        return window.GetVisualDescendants().OfType<FieldManagerView>().Single();
    }

    private static void AddField(Window window, FieldManagerView view, string name, bool pressEnter)
    {
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(view, "FieldNewNameBox"), name);

        if (pressEnter)
        {
            HeadlessInput.Press(window, Key.Enter);
            return;
        }

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "FieldAddButton"));
    }

    /// <summary>Moves the add row's type list one entry down (Text, Number, Date, Boolean, Choice) and adds a field.</summary>
    private static void AddFieldOfNextType(Window window, FieldManagerView view, string name)
    {
        var typeBox = HeadlessInput.Find<ComboBox>(view, "FieldNewTypeBox");
        HeadlessInput.ChooseEntry(window, typeBox, downPresses: 1);
        AddField(window, view, name, pressEnter: false);
    }

    /// <summary>Browses the field's type list one entry down with the keyboard and commits it with Enter.</summary>
    private static void ChooseNextType(Window window, FieldManagerView view)
    {
        HeadlessInput.ChooseEntry(window, HeadlessInput.Find<ComboBox>(view, "FieldTypeBox"), downPresses: 1);
        HeadlessInput.Press(window, Key.Enter);
    }

    private static void OpenChoicesPanel(Window window, FieldManagerView view)
    {
        var expander = HeadlessInput.Find<Expander>(view, "FieldChoicesExpander");

        if (!expander.IsExpanded)
        {
            HeadlessInput.Click(window, expander.GetVisualDescendants().OfType<ToggleButton>().First());
        }
    }

    private static Button FieldButton(FieldManagerView view, string automationId, string fieldName)
    {
        return Assert.Single(HeadlessInput.FindAll<Button>(view, automationId),
            button => button.DataContext is FieldRowViewModel row && row.Name == fieldName);
    }

    private static Button ChoiceButton(FieldManagerView view, string automationId, string label)
    {
        return Assert.Single(HeadlessInput.FindAll<Button>(view, automationId),
            button => button.DataContext is FieldChoiceRowViewModel row && row.Label == label);
    }

    private static void TypeIntoDialog(Window window, string text)
    {
        var dialog = Assert.Single(window.OwnedWindows);
        dialog.KeyTextInput(text);
        HeadlessInput.Press(dialog, Key.Enter);
    }
}