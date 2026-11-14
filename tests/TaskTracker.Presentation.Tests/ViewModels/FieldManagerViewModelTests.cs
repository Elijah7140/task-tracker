#pragma warning disable xUnit1051
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class FieldManagerViewModelTests
{
    [Fact]
    public async Task Adding_a_field_saves_it()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var manager = await LoadManagerAsync(store, null);
        manager.NewName = "Effort";
        manager.NewType = FieldDataType.Number;

        await manager.AddCommand.ExecuteAsync(null);

        var row = Assert.Single(manager.Rows);
        var saved = Assert.Single(await store.Fields.ListAllAsync(null));
        Assert.Equal("Effort", row.Name);
        Assert.Equal(FieldDataType.Number, row.SelectedType);
        Assert.Equal("Effort", saved.DisplayName);
        Assert.Equal(FieldDataType.Number, saved.DataType);
    }

    [Fact]
    public async Task Adding_a_field_clears_the_name_box()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var manager = await LoadManagerAsync(store, null);
        manager.NewName = "Effort";

        await manager.AddCommand.ExecuteAsync(null);

        Assert.Equal(string.Empty, manager.NewName);
    }

    [Fact]
    public async Task A_new_choice_field_opens_its_choices_panel()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var manager = await LoadManagerAsync(store, null);
        manager.NewName = "Status";
        manager.NewType = FieldDataType.Choice;

        await manager.AddCommand.ExecuteAsync(null);

        var row = Assert.Single(manager.Rows);
        Assert.True(row.Choices!.IsExpanded);
    }

    [Fact]
    public async Task A_blank_name_shows_the_rule_message_and_adds_nothing()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var dialogs = new FakeDialogService();
        var manager = await LoadManagerAsync(store, null, dialogs);
        manager.NewName = "   ";

        await manager.AddCommand.ExecuteAsync(null);

        Assert.Empty(manager.Rows);
        Assert.Contains("Field name must be 1 to 300 characters.", dialogs.Messages);
    }

    [Fact]
    public async Task A_duplicate_name_shows_the_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var dialogs = new FakeDialogService();
        var manager = await LoadManagerAsync(store, null, dialogs);
        manager.NewName = "effort";

        await manager.AddCommand.ExecuteAsync(null);

        Assert.Single(manager.Rows);
        Assert.Contains("Field name is already visible in this project.", dialogs.Messages);
    }

    [Fact]
    public async Task A_duplicate_name_is_kept_in_the_box_so_it_can_be_fixed()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var manager = await LoadManagerAsync(store, null);
        manager.NewName = "effort";

        await manager.AddCommand.ExecuteAsync(null);

        Assert.Equal("effort", manager.NewName);
    }

    [Fact]
    public async Task Renaming_a_field_uses_the_prompted_name()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var dialogs = new FakeDialogService { PromptResult = "Story points" };
        var manager = await LoadManagerAsync(store, null, dialogs);

        await manager.RenameCommand.ExecuteAsync(Assert.Single(manager.Rows));

        var saved = Assert.Single(await store.Fields.ListAllAsync(null));
        Assert.Equal("Story points", Assert.Single(manager.Rows).Name);
        Assert.Equal("Story points", saved.DisplayName);
    }

    [Fact]
    public async Task Renaming_a_field_keeps_the_half_typed_name_of_the_next_field()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var manager = await LoadManagerAsync(store, null, new FakeDialogService { PromptResult = "Story points" });
        manager.NewName = "Half typed";

        await manager.RenameCommand.ExecuteAsync(Assert.Single(manager.Rows));

        Assert.Equal("Half typed", manager.NewName);
    }

    [Fact]
    public async Task Cancelling_the_rename_prompt_changes_nothing()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var manager = await LoadManagerAsync(store, null, new FakeDialogService { PromptResult = null });

        await manager.RenameCommand.ExecuteAsync(Assert.Single(manager.Rows));

        Assert.Equal("Effort", Assert.Single(manager.Rows).Name);
    }

    [Fact]
    public async Task Renaming_to_a_name_in_use_shows_the_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        var dialogs = new FakeDialogService { PromptResult = "Effort" };
        var manager = await LoadManagerAsync(store, null, dialogs);

        await manager.RenameCommand.ExecuteAsync(manager.Rows[1]);

        Assert.Equal("Summary", manager.Rows[1].Name);
        Assert.Contains("Field name is already visible in this project.", dialogs.Messages);
    }

    [Fact]
    public async Task Choosing_another_type_saves_it_while_the_field_has_no_values()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Effort", FieldDataType.Text, null);
        var manager = await LoadManagerAsync(store, null);

        manager.Rows[0].SelectedType = FieldDataType.Number;
        await manager.ChangeTypeCommand.ExecutionTask!;

        var saved = Assert.Single(await store.Fields.ListAllAsync(null));
        Assert.Equal(FieldDataType.Number, saved.DataType);
        Assert.Equal(FieldDataType.Number, Assert.Single(manager.Rows).SelectedType);
    }

    [Fact]
    public async Task Changing_an_existing_field_to_choice_opens_its_choices_panel()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Status", FieldDataType.Text, null);
        var manager = await LoadManagerAsync(store, null);

        manager.Rows[0].SelectedType = FieldDataType.Choice;
        await manager.ChangeTypeCommand.ExecutionTask!;

        var row = Assert.Single(manager.Rows);
        Assert.True(row.IsChoice);
        Assert.True(row.Choices!.IsExpanded);
    }

    [Fact]
    public async Task Changing_the_type_of_a_field_with_values_shows_the_service_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var dialogs = new FakeDialogService();
        var manager = await LoadManagerWithAStoredValueAsync(store, dialogs);

        manager.Rows[0].SelectedType = FieldDataType.Number;
        await manager.ChangeTypeCommand.ExecutionTask!;

        Assert.Contains("A field with values cannot change type.", dialogs.Messages);
    }

    [Fact]
    public async Task A_refused_type_change_puts_the_saved_type_back_in_the_row()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var manager = await LoadManagerWithAStoredValueAsync(store, new FakeDialogService());

        manager.Rows[0].SelectedType = FieldDataType.Number;
        await manager.ChangeTypeCommand.ExecutionTask!;

        var saved = Assert.Single(await store.Fields.ListAllAsync(null));
        Assert.Equal(FieldDataType.Text, Assert.Single(manager.Rows).SelectedType);
        Assert.Equal(FieldDataType.Text, saved.DataType);
    }

    [Fact]
    public async Task Moving_a_field_down_changes_its_saved_order()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await CreateTextFieldsAsync(store, null, "First", "Second", "Third");
        var manager = await LoadManagerAsync(store, null);

        await manager.MoveDownCommand.ExecuteAsync(manager.Rows[0]);

        var savedNames = await SavedFieldNamesAsync(store, null);
        Assert.Equal(["Second", "First", "Third"], manager.Rows.Select(row => row.Name));
        Assert.Equal(["Second", "First", "Third"], savedNames);
    }

    [Fact]
    public async Task Moving_a_field_up_changes_its_saved_order()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await CreateTextFieldsAsync(store, null, "First", "Second", "Third");
        var manager = await LoadManagerAsync(store, null);

        await manager.MoveUpCommand.ExecuteAsync(manager.Rows[2]);

        var savedNames = await SavedFieldNamesAsync(store, null);
        Assert.Equal(["First", "Third", "Second"], manager.Rows.Select(row => row.Name));
        Assert.Equal(["First", "Third", "Second"], savedNames);
    }

    [Fact]
    public async Task The_first_row_cannot_move_up_and_the_last_cannot_move_down()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await CreateTextFieldsAsync(store, null, "First", "Second");
        var manager = await LoadManagerAsync(store, null);

        Assert.False(manager.MoveUpCommand.CanExecute(manager.Rows[0]));
        Assert.True(manager.MoveDownCommand.CanExecute(manager.Rows[0]));
        Assert.True(manager.MoveUpCommand.CanExecute(manager.Rows[1]));
        Assert.False(manager.MoveDownCommand.CanExecute(manager.Rows[1]));
    }

    [Fact]
    public async Task Reordering_passes_every_field_of_the_scope_including_archived_ones()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var fields = await CreateTextFieldsAsync(store, null, "First", "Hidden", "Third");
        await store.Fields.ArchiveAsync(fields[1].Id);
        var manager = await LoadManagerAsync(store, null);

        await manager.MoveDownCommand.ExecuteAsync(manager.Rows[0]);

        var savedNames = await SavedFieldNamesAsync(store, null);
        Assert.Equal(["Third", "First"], manager.Rows.Select(row => row.Name));
        Assert.Equal(["Third", "Hidden", "First"], savedNames);
    }

    [Fact]
    public async Task Archiving_a_field_hides_its_row_and_saves_it_as_archived()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var manager = await LoadManagerAsync(store, null);

        await manager.ArchiveCommand.ExecuteAsync(manager.Rows[0]);

        var saved = Assert.Single(await store.Fields.ListAllAsync(null));
        Assert.Empty(manager.Rows);
        Assert.True(saved.IsArchived);
    }

    [Fact]
    public async Task Show_archived_lists_archived_fields()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var field = await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        await store.Fields.ArchiveAsync(field.Id);
        var manager = await LoadManagerAsync(store, null);

        await manager.SetShowArchivedCommand.ExecuteAsync(true);

        var row = Assert.Single(manager.Rows);
        Assert.True(manager.ShowArchived);
        Assert.True(row.IsArchived);
    }

    [Fact]
    public async Task Switching_show_archived_off_hides_archived_fields_again()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var field = await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        await store.Fields.ArchiveAsync(field.Id);
        var manager = await LoadManagerAsync(store, null);
        await manager.SetShowArchivedCommand.ExecuteAsync(true);

        await manager.SetShowArchivedCommand.ExecuteAsync(false);

        Assert.Empty(manager.Rows);
        Assert.False(manager.ShowArchived);
    }

    [Fact]
    public async Task Restoring_an_archived_field_makes_it_active_again()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var field = await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        await store.Fields.ArchiveAsync(field.Id);
        var manager = await LoadManagerAsync(store, null);
        await manager.SetShowArchivedCommand.ExecuteAsync(true);

        await manager.UnarchiveCommand.ExecuteAsync(manager.Rows[0]);

        var saved = Assert.Single(await store.Fields.ListAllAsync(null));
        Assert.False(Assert.Single(manager.Rows).IsArchived);
        Assert.False(saved.IsArchived);
    }

    [Fact]
    public async Task Archived_rows_cannot_move_and_active_rows_skip_over_them()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var fields = await CreateTextFieldsAsync(store, null, "First", "Hidden", "Third");
        await store.Fields.ArchiveAsync(fields[1].Id);
        var manager = await LoadManagerAsync(store, null);

        await manager.SetShowArchivedCommand.ExecuteAsync(true);

        Assert.Equal(["First", "Hidden", "Third"], manager.Rows.Select(row => row.Name));
        Assert.False(manager.MoveUpCommand.CanExecute(manager.Rows[1]));
        Assert.False(manager.MoveDownCommand.CanExecute(manager.Rows[1]));
        Assert.True(manager.MoveDownCommand.CanExecute(manager.Rows[0]));
    }

    [Fact]
    public async Task Restoring_a_field_whose_name_is_now_taken_shows_the_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var original = await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        await store.Fields.ArchiveAsync(original.Id);
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var dialogs = new FakeDialogService();
        var manager = await LoadManagerAsync(store, null, dialogs);
        await manager.SetShowArchivedCommand.ExecuteAsync(true);
        var archivedRow = manager.Rows.Single(row => row.IsArchived);

        await manager.UnarchiveCommand.ExecuteAsync(archivedRow);

        Assert.Contains("Field name is already visible in this project.", dialogs.Messages);
        Assert.True(manager.Rows.Single(row => row.Id == archivedRow.Id).IsArchived);
    }

    [Fact]
    public async Task Adding_a_choice_saves_it()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        var manager = await LoadManagerAsync(store, null);
        var choices = manager.Rows[0].Choices!;
        choices.NewLabel = "Ready";

        await choices.AddCommand.ExecuteAsync(null);

        var saved = Assert.Single(await store.Fields.ListChoicesAsync(status.Id));
        Assert.Equal(["Ready"], choices.Rows.Select(choice => choice.Label));
        Assert.Equal("Ready", saved.Label);
    }

    [Fact]
    public async Task Adding_a_choice_clears_only_that_fields_box()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        await store.Fields.CreateAsync("Severity", FieldDataType.Choice, null);
        var manager = await LoadManagerAsync(store, null);
        manager.Rows[0].Choices!.NewLabel = "Ready";
        manager.Rows[1].Choices!.NewLabel = "Half typed";

        await manager.Rows[0].Choices!.AddCommand.ExecuteAsync(null);

        Assert.Equal(string.Empty, manager.Rows[0].Choices!.NewLabel);
        Assert.Equal("Half typed", manager.Rows[1].Choices!.NewLabel);
    }

    [Fact]
    public async Task A_duplicate_choice_label_shows_the_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        await store.Fields.AddChoiceAsync(status.Id, "Ready");
        var dialogs = new FakeDialogService();
        var manager = await LoadManagerAsync(store, null, dialogs);
        var choices = manager.Rows[0].Choices!;
        choices.NewLabel = "ready";

        await choices.AddCommand.ExecuteAsync(null);

        Assert.Contains("Choice label is already used by this field.", dialogs.Messages);
    }

    [Fact]
    public async Task A_duplicate_choice_label_is_kept_in_the_box_so_it_can_be_fixed()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        await store.Fields.AddChoiceAsync(status.Id, "Ready");
        var manager = await LoadManagerAsync(store, null);
        var choices = manager.Rows[0].Choices!;
        choices.NewLabel = "ready";

        await choices.AddCommand.ExecuteAsync(null);

        Assert.Equal("ready", choices.NewLabel);
    }

    [Fact]
    public async Task Renaming_a_choice_uses_the_prompted_label()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        await store.Fields.AddChoiceAsync(status.Id, "Ready");
        var manager = await LoadManagerAsync(store, null, new FakeDialogService { PromptResult = "Done" });
        var choices = manager.Rows[0].Choices!;

        await choices.RenameCommand.ExecuteAsync(choices.Rows[0]);

        var saved = Assert.Single(await store.Fields.ListChoicesAsync(status.Id));
        Assert.Equal("Done", Assert.Single(choices.Rows).Label);
        Assert.Equal("Done", saved.Label);
    }

    [Fact]
    public async Task Moving_a_choice_down_changes_its_saved_order()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        await AddChoicesAsync(store, status, "Ready", "Blocked", "Done");
        var manager = await LoadManagerAsync(store, null);
        var choices = manager.Rows[0].Choices!;

        await choices.MoveDownCommand.ExecuteAsync(choices.Rows[0]);

        var savedLabels = await SavedChoiceLabelsAsync(store, status);
        Assert.Equal(["Blocked", "Ready", "Done"], choices.Rows.Select(choice => choice.Label));
        Assert.Equal(["Blocked", "Ready", "Done"], savedLabels);
    }

    [Fact]
    public async Task Moving_a_choice_up_changes_its_saved_order()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        await AddChoicesAsync(store, status, "Ready", "Blocked", "Done");
        var manager = await LoadManagerAsync(store, null);
        var choices = manager.Rows[0].Choices!;

        await choices.MoveUpCommand.ExecuteAsync(choices.Rows[2]);

        var savedLabels = await SavedChoiceLabelsAsync(store, status);
        Assert.Equal(["Ready", "Done", "Blocked"], choices.Rows.Select(choice => choice.Label));
        Assert.Equal(["Ready", "Done", "Blocked"], savedLabels);
    }

    [Fact]
    public async Task Reordering_choices_passes_archived_choices_too()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        var created = await AddChoicesAsync(store, status, "Ready", "Retired", "Done");
        await store.Fields.ArchiveChoiceAsync(status.Id, created[1].Id);
        var manager = await LoadManagerAsync(store, null);
        var choices = manager.Rows[0].Choices!;

        await choices.MoveDownCommand.ExecuteAsync(choices.Rows[0]);

        var savedLabels = await SavedChoiceLabelsAsync(store, status);
        Assert.Equal(["Done", "Ready"], choices.Rows.Select(choice => choice.Label));
        Assert.Equal(["Done", "Retired", "Ready"], savedLabels);
    }

    [Fact]
    public async Task Archiving_a_choice_hides_it_and_saves_it_as_archived()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        await AddChoicesAsync(store, status, "Ready", "Retired");
        var manager = await LoadManagerAsync(store, null);
        var choices = manager.Rows[0].Choices!;

        await choices.ArchiveCommand.ExecuteAsync(choices.Rows[1]);

        var archived = (await store.Fields.ListChoicesAsync(status.Id)).Single(choice => choice.Label == "Retired");
        Assert.Equal(["Ready"], choices.Rows.Select(choice => choice.Label));
        Assert.True(archived.IsArchived);
    }

    [Fact]
    public async Task Archived_choices_are_listed_when_show_archived_is_on()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        var created = await AddChoicesAsync(store, status, "Ready", "Retired");
        await store.Fields.ArchiveChoiceAsync(status.Id, created[1].Id);
        var manager = await LoadManagerAsync(store, null);

        await manager.SetShowArchivedCommand.ExecuteAsync(true);

        var choices = manager.Rows[0].Choices!;
        Assert.Equal(["Ready", "Retired"], choices.Rows.Select(choice => choice.Label));
        Assert.True(choices.Rows[1].IsArchived);
    }

    [Fact]
    public async Task Restoring_an_archived_choice_makes_it_active_again()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        var created = await AddChoicesAsync(store, status, "Ready", "Retired");
        await store.Fields.ArchiveChoiceAsync(status.Id, created[1].Id);
        var manager = await LoadManagerAsync(store, null);
        await manager.SetShowArchivedCommand.ExecuteAsync(true);
        var choices = manager.Rows[0].Choices!;

        await choices.UnarchiveCommand.ExecuteAsync(choices.Rows[1]);

        var restored = (await store.Fields.ListChoicesAsync(status.Id)).Single(choice => choice.Label == "Retired");
        Assert.All(choices.Rows, choice => Assert.False(choice.IsArchived));
        Assert.False(restored.IsArchived);
    }

    [Fact]
    public async Task An_archived_field_offers_no_new_choices()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        await store.Fields.ArchiveAsync(status.Id);
        var manager = await LoadManagerAsync(store, null);

        await manager.SetShowArchivedCommand.ExecuteAsync(true);

        Assert.False(manager.Rows[0].Choices!.CanAdd);
    }

    [Fact]
    public async Task The_choices_panel_stays_open_after_the_list_reloads()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        var manager = await LoadManagerAsync(store, null);
        manager.Rows[0].Choices!.IsExpanded = true;

        await manager.RenameCommand.ExecuteAsync(manager.Rows[1]);
        await manager.LoadAsync();

        Assert.True(manager.Rows[0].Choices!.IsExpanded);
    }

    [Fact]
    public async Task A_panel_the_user_closed_stays_closed_after_the_list_reloads()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        var manager = await LoadManagerAsync(store, null);
        manager.Rows[0].Choices!.IsExpanded = true;
        await manager.LoadAsync();
        manager.Rows[0].Choices!.IsExpanded = false;

        await manager.LoadAsync();

        Assert.False(manager.Rows[0].Choices!.IsExpanded);
    }

    [Fact]
    public async Task The_choices_header_counts_active_choices()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        var created = await AddChoicesAsync(store, status, "Ready", "Retired");
        await store.Fields.ArchiveChoiceAsync(status.Id, created[1].Id);

        var manager = await LoadManagerAsync(store, null);

        Assert.Equal("Choices (1)", manager.Rows[0].Choices!.Header);
    }

    [Fact]
    public async Task Only_choice_fields_have_a_choices_panel()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);

        var manager = await LoadManagerAsync(store, null);

        Assert.Null(manager.Rows[0].Choices);
        Assert.False(manager.Rows[0].IsChoice);
    }

    [Fact]
    public async Task A_project_manager_shows_its_own_fields()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var other = await store.Projects.CreateAsync("Website");
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        await store.Fields.CreateAsync("Project note", FieldDataType.Text, project.Id);
        await store.Fields.CreateAsync("Website only", FieldDataType.Text, other.Id);

        var manager = await LoadManagerAsync(store, project.Id);

        Assert.Equal(["Project note"], manager.Rows.Select(row => row.Name));
        Assert.True(manager.HasInherited);
    }

    [Fact]
    public async Task A_project_manager_lists_only_active_global_fields_as_inherited()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var oldGlobal = await store.Fields.CreateAsync("Old global", FieldDataType.Text, null);
        await store.Fields.ArchiveAsync(oldGlobal.Id);

        var manager = await LoadManagerAsync(store, project.Id);

        Assert.Equal(["Effort"], manager.Inherited.Select(row => row.Name));
    }

    [Fact]
    public async Task Adding_in_a_project_manager_creates_a_project_field()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var manager = await LoadManagerAsync(store, project.Id);
        manager.NewName = "Project note";

        await manager.AddCommand.ExecuteAsync(null);

        var saved = Assert.Single(await store.Fields.ListAllAsync(project.Id));
        Assert.Equal(project.Id, saved.ProjectId);
    }

    [Fact]
    public async Task The_global_manager_has_no_inherited_list_and_ignores_project_fields()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Fields.CreateAsync("Project note", FieldDataType.Text, project.Id);
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);

        var manager = await LoadManagerAsync(store, null);

        Assert.Equal(["Effort"], manager.Rows.Select(row => row.Name));
        Assert.Empty(manager.Inherited);
        Assert.False(manager.HasInherited);
    }

    [Fact]
    public async Task Moving_a_project_field_leaves_global_field_order_alone()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await CreateTextFieldsAsync(store, null, "Global one", "Global two");
        await CreateTextFieldsAsync(store, project.Id, "Mine one", "Mine two");
        var manager = await LoadManagerAsync(store, project.Id);

        await manager.MoveDownCommand.ExecuteAsync(manager.Rows[0]);

        var projectNames = await SavedFieldNamesAsync(store, project.Id);
        var globalNames = await SavedFieldNamesAsync(store, null);
        Assert.Equal(["Mine two", "Mine one"], projectNames);
        Assert.Equal(["Global one", "Global two"], globalNames);
    }

    private static async Task<FieldManagerViewModel> LoadManagerAsync(PresentationTestStore store,
        Guid? projectId, FakeDialogService? dialogs = null)
    {
        var manager = new FieldManagerViewModel(store.Fields, dialogs ?? new FakeDialogService(), projectId);
        await manager.LoadAsync();

        return manager;
    }

    /// <summary>Creates a global text field that an item already has a value for, and loads its manager.</summary>
    private static async Task<FieldManagerViewModel> LoadManagerWithAStoredValueAsync(
        PresentationTestStore store, FakeDialogService dialogs)
    {
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Task");
        var field = await store.Fields.CreateAsync("Effort", FieldDataType.Text, null);
        var edit = new ItemEdit(item.Title, null, null, null, null, null, null, null, null);
        await store.Items.EditAsync(item.Id, edit, [new(field.Id, TextValue: "big")]);

        return await LoadManagerAsync(store, null, dialogs);
    }

    private static async Task<List<FieldDefinition>> CreateTextFieldsAsync(PresentationTestStore store,
        Guid? projectId, params string[] names)
    {
        var created = new List<FieldDefinition>();

        foreach (var name in names)
        {
            created.Add(await store.Fields.CreateAsync(name, FieldDataType.Text, projectId));
        }

        return created;
    }

    private static async Task<List<FieldChoice>> AddChoicesAsync(PresentationTestStore store,
        FieldDefinition field, params string[] labels)
    {
        var created = new List<FieldChoice>();

        foreach (var label in labels)
        {
            created.Add(await store.Fields.AddChoiceAsync(field.Id, label));
        }

        return created;
    }

    private static async Task<string[]> SavedFieldNamesAsync(PresentationTestStore store, Guid? projectId)
    {
        var all = await store.Fields.ListAllAsync(projectId);

        return all.Where(field => field.ProjectId == projectId)
            .OrderBy(field => field.SortOrder)
            .Select(field => field.DisplayName)
            .ToArray();
    }

    private static async Task<string[]> SavedChoiceLabelsAsync(PresentationTestStore store, FieldDefinition field)
    {
        var choices = await store.Fields.ListChoicesAsync(field.Id);

        return choices.OrderBy(choice => choice.SortOrder).Select(choice => choice.Label).ToArray();
    }
}