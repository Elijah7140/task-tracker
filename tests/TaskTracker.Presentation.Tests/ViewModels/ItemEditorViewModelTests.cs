#pragma warning disable xUnit1051
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Urgency;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class ItemEditorViewModelTests
{
    [Fact]
    public async Task Saving_and_reverting_editor_changes_uses_a_fresh_snapshot()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Original");
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(Assert.Single(page.OpenItems));
        page.Editor!.Title = "Saved";

        Assert.True(await page.SaveAsync());
        page.Editor!.Title = "Discarded";
        page.Revert();
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Equal(item.Id, page.Editor!.Id);
        Assert.Equal("Saved", page.Editor.Title);
        Assert.Equal("Saved", snapshot.Items[0].Item.Title);
    }

    [Fact]
    public async Task Archived_lookups_remain_visible_but_are_absent_from_editor_choices()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Task");
        var type = await store.Lookups.AddItemTypeAsync("Legacy");
        var priority = await store.Lookups.AddPriorityLevelAsync("Old rank");
        await store.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, null,
            type.Id, priority.Id, null, null, null, null));
        await store.Lookups.ArchiveItemTypeAsync(type.Id);
        await store.Lookups.ArchivePriorityLevelAsync(priority.Id);
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();

        await page.SelectItemAsync(Assert.Single(page.OpenItems));

        Assert.Equal("Legacy", page.Editor!.ArchivedTypeName);
        Assert.Equal("Old rank", page.Editor.ArchivedPriorityName);
        Assert.DoesNotContain(page.ItemTypes, choice => choice.Id == type.Id);
        Assert.DoesNotContain(page.PriorityLevels, choice => choice.Id == priority.Id);
    }

    [Fact]
    public async Task Invalid_editor_title_is_shown_and_not_saved()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Items.CreateAsync(project.Id, null, null, "Original");
        var dialogs = new FakeDialogService();
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync();
        await page.SelectItemAsync(Assert.Single(page.OpenItems));
        page.Editor!.Title = "  ";

        var saved = await page.SaveAsync();
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.False(saved);
        Assert.Equal("Original", snapshot.Items[0].Item.Title);
        Assert.Contains(dialogs.Messages, message => message.Contains("title", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task None_picker_entries_clear_type_and_priority()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Task");
        var type = (await store.Lookups.ItemTypesAsync()).First();
        var priority = (await store.Lookups.PriorityLevelsAsync()).First();
        await store.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, null,
            type.Id, priority.Id, null, null, null, null));
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id);
        await page.LoadAsync();
        await page.SelectItemAsync(Assert.Single(page.OpenItems));

        page.Editor!.SelectedTypeOption = page.TypeOptions[0];
        page.Editor.SelectedPriorityOption = page.PriorityOptions[0];
        await page.SaveAsync();
        var snapshot = await store.Items.LoadAreaAsync(project.Id, null);

        Assert.Null(snapshot.Items[0].Item.ItemTypeId);
        Assert.Null(snapshot.Items[0].Item.PriorityLevelId);
    }

    [Fact]
    public async Task Opening_an_item_loads_an_input_with_the_stored_value_for_each_field_type()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        var fields = await CreateOneFieldOfEachTypeAsync(store);
        await store.Items.EditAsync(item.Id, EditOf(item), fields.StoredValues);

        using var page = await OpenItemAsync(store, project);

        var inputs = page.Editor!.CustomFields;
        Assert.Equal("Check cost", Assert.IsType<TextFieldInputViewModel>(inputs[0]).Text);
        Assert.Equal("3.5", Assert.IsType<NumberFieldInputViewModel>(inputs[1]).Text);
        Assert.Equal(new DateTime(2026, 11, 19), Assert.IsType<DateFieldInputViewModel>(inputs[2]).Date);
        Assert.Equal("Yes", Assert.IsType<BooleanFieldInputViewModel>(inputs[3]).Selected.Label);
        Assert.Equal("Ready", Assert.IsType<ChoiceFieldInputViewModel>(inputs[4]).Selected.Label);
    }

    [Fact]
    public async Task Stored_custom_values_do_not_make_a_freshly_opened_draft_dirty()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        var fields = await CreateOneFieldOfEachTypeAsync(store);
        await store.Items.EditAsync(item.Id, EditOf(item), fields.StoredValues);

        using var page = await OpenItemAsync(store, project);

        Assert.False(page.Editor!.IsDirty(item));
    }

    [Fact]
    public async Task The_field_list_is_refreshed_each_time_an_item_opens()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, _) = await CreateItemAsync(store);
        await store.Items.CreateAsync(project.Id, null, null, "Other");
        using var page = await OpenItemAsync(store, project);
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);

        await page.SelectItemAsync(page.OpenItems[1]);

        Assert.Equal("Effort", Assert.Single(page.Editor!.CustomFields).Name);
    }

    [Fact]
    public async Task Each_item_shows_its_own_values()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, first) = await CreateItemAsync(store);
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var effort = await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        await store.Items.EditAsync(first.Id, EditOf(first), [new(effort.Id, NumberValue: 1)]);
        await store.Items.EditAsync(second.Id, EditOf(second), [new(effort.Id, NumberValue: 2)]);
        using var page = await OpenItemAsync(store, project);

        await page.SelectItemAsync(page.OpenItems.Single(row => row.Id == second.Id));

        var input = Assert.IsType<NumberFieldInputViewModel>(Assert.Single(page.Editor!.CustomFields));
        Assert.Equal("2", input.Text);
    }

    [Fact]
    public async Task Editing_only_a_custom_field_makes_the_draft_dirty()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        using var page = await OpenItemAsync(store, project);

        Input<TextFieldInputViewModel>(page.Editor!, 0).Text = "typed";

        Assert.True(page.Editor!.IsDirty(item));
    }

    [Fact]
    public async Task Save_stores_the_edited_custom_values_with_the_item()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        var fields = await CreateOneFieldOfEachTypeAsync(store);
        using var page = await OpenItemAsync(store, project);
        FillEveryInput(page.Editor!, fields.Ready);

        var saved = await page.SaveAsync();

        var values = await store.Items.LoadFieldValuesAsync(item.Id);
        Assert.True(saved);
        Assert.Equivalent(fields.StoredValues, values.Select(ToInput));
    }

    [Fact]
    public async Task Save_stores_the_built_in_fields_with_the_custom_values()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, _) = await CreateItemAsync(store);
        await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        using var page = await OpenItemAsync(store, project);
        page.Editor!.Title = "Renamed";
        Input<TextFieldInputViewModel>(page.Editor, 0).Text = "typed";

        await page.SaveAsync();

        var area = await store.Items.LoadAreaAsync(project.Id, null);
        Assert.Equal("Renamed", area.Items[0].Item.Title);
    }

    [Fact]
    public async Task Save_sends_only_the_custom_fields_that_changed()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        var summary = await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        var effort = await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        await store.Items.EditAsync(item.Id, EditOf(item), [new(summary.Id, TextValue: "original")]);
        using var page = await OpenItemAsync(store, project);
        await store.Items.EditAsync(item.Id, EditOf(item), [new(summary.Id, TextValue: "changed elsewhere")]);
        Input<NumberFieldInputViewModel>(page.Editor!, 1).Text = "5";

        await page.SaveAsync();

        var values = await store.Items.LoadFieldValuesAsync(item.Id);
        Assert.Equal("changed elsewhere", values.Single(value => value.FieldDefinitionId == summary.Id).TextValue);
        Assert.Equal(5, values.Single(value => value.FieldDefinitionId == effort.Id).NumberValue);
    }

    [Fact]
    public async Task Clearing_a_custom_value_removes_it_on_save()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        var summary = await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        await store.Items.EditAsync(item.Id, EditOf(item), [new(summary.Id, TextValue: "original")]);
        using var page = await OpenItemAsync(store, project);
        Input<TextFieldInputViewModel>(page.Editor!, 0).Text = string.Empty;

        await page.SaveAsync();

        var values = await store.Items.LoadFieldValuesAsync(item.Id);
        Assert.Empty(values);
    }

    [Fact]
    public async Task Archived_field_values_are_shown_read_only()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        await StoreAnArchivedTextValueAsync(store, item, "kept");

        using var page = await OpenItemAsync(store, project);

        var archived = Assert.Single(page.Editor!.ArchivedFields);
        Assert.Empty(page.Editor.CustomFields);
        Assert.Equal("kept", archived.DisplayValue);
    }

    [Fact]
    public async Task Archived_field_values_survive_saving_other_changes_and_are_not_sent()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        await StoreAnArchivedTextValueAsync(store, item, "kept");
        var dialogs = new FakeDialogService();
        using var page = await OpenItemAsync(store, project, dialogs);
        page.Editor!.Title = "Renamed";

        var saved = await page.SaveAsync();

        var values = await store.Items.LoadFieldValuesAsync(item.Id);
        Assert.True(saved);
        Assert.Empty(dialogs.Messages);
        Assert.Equal("kept", Assert.Single(values).TextValue);
    }

    [Fact]
    public async Task Archived_field_values_are_still_listed_after_revert()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        await StoreAnArchivedTextValueAsync(store, item, "kept");
        using var page = await OpenItemAsync(store, project);
        page.Editor!.Title = "Unsaved title";

        page.Revert();

        var archived = Assert.Single(page.Editor!.ArchivedFields);
        Assert.True(page.Editor.HasArchivedFields);
        Assert.Equal("kept", archived.DisplayValue);
    }

    [Fact]
    public async Task An_archived_choice_is_labelled_in_the_editor()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        await StoreAnArchivedChoiceAsync(store, item);

        using var page = await OpenItemAsync(store, project);

        var input = Assert.IsType<ChoiceFieldInputViewModel>(Assert.Single(page.Editor!.CustomFields));
        Assert.Equal("Retired (archived)", input.Selected.Label);
    }

    [Fact]
    public async Task An_archived_choice_is_kept_when_saving_other_changes()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        var retiredId = await StoreAnArchivedChoiceAsync(store, item);
        using var page = await OpenItemAsync(store, project);
        page.Editor!.Title = "Renamed";

        await page.SaveAsync();

        var values = await store.Items.LoadFieldValuesAsync(item.Id);
        Assert.Equal(retiredId, Assert.Single(values).ChoiceId);
    }

    [Fact]
    public async Task Revert_puts_back_the_stored_custom_values()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        var summary = await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        await store.Items.EditAsync(item.Id, EditOf(item), [new(summary.Id, TextValue: "stored")]);
        using var page = await OpenItemAsync(store, project);
        Input<TextFieldInputViewModel>(page.Editor!, 0).Text = "unsaved";
        page.Editor!.Title = "Unsaved title";

        page.Revert();

        var input = Assert.IsType<TextFieldInputViewModel>(Assert.Single(page.Editor!.CustomFields));
        Assert.Equal("stored", input.Text);
        Assert.Equal("Task", page.Editor.Title);
        Assert.False(page.Editor.IsDirty(item));
    }

    [Fact]
    public async Task Save_is_disabled_while_a_custom_number_is_invalid()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, _) = await CreateItemAsync(store);
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        using var page = await OpenItemAsync(store, project);

        Input<NumberFieldInputViewModel>(page.Editor!, 0).Text = "twelve";

        Assert.False(page.SaveCommand.CanExecute(null));
    }

    [Fact]
    public async Task Save_is_enabled_again_once_the_custom_number_is_fixed()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, _) = await CreateItemAsync(store);
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        using var page = await OpenItemAsync(store, project);
        var number = Input<NumberFieldInputViewModel>(page.Editor!, 0);
        number.Text = "twelve";

        number.Text = "12";

        Assert.True(page.SaveCommand.CanExecute(null));
    }

    [Fact]
    public async Task Saving_an_invalid_custom_number_shows_a_message_and_returns_false()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, _) = await CreateItemAsync(store);
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var dialogs = new FakeDialogService();
        using var page = await OpenItemAsync(store, project, dialogs);
        Input<NumberFieldInputViewModel>(page.Editor!, 0).Text = "twelve";

        var saved = await page.SaveAsync();

        Assert.False(saved);
        Assert.Single(dialogs.Messages);
    }

    [Fact]
    public async Task Saving_an_invalid_custom_number_stores_nothing()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, _) = await CreateItemAsync(store);
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        using var page = await OpenItemAsync(store, project);
        page.Editor!.Title = "Renamed";
        Input<NumberFieldInputViewModel>(page.Editor, 0).Text = "twelve";

        await page.SaveAsync();

        var area = await store.Items.LoadAreaAsync(project.Id, null);
        Assert.Equal("Task", area.Items[0].Item.Title);
    }

    [Fact]
    public async Task A_rule_message_from_the_service_is_shown_when_saving_custom_fields()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, _) = await CreateItemAsync(store);
        var summary = await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        var dialogs = new FakeDialogService();
        using var page = await OpenItemAsync(store, project, dialogs);
        await store.Fields.ArchiveAsync(summary.Id);
        Input<TextFieldInputViewModel>(page.Editor!, 0).Text = "typed";

        var saved = await page.SaveAsync();

        Assert.False(saved);
        Assert.Contains("Archived fields cannot receive new values.", dialogs.Messages);
    }

    [Fact]
    public async Task A_refused_custom_field_save_keeps_the_draft_and_stores_nothing()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, item) = await CreateItemAsync(store);
        var summary = await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        using var page = await OpenItemAsync(store, project);
        await store.Fields.ArchiveAsync(summary.Id);
        page.Editor!.Title = "Renamed";
        Input<TextFieldInputViewModel>(page.Editor, 0).Text = "typed";

        await page.SaveAsync();

        var area = await store.Items.LoadAreaAsync(project.Id, null);
        var values = await store.Items.LoadFieldValuesAsync(item.Id);
        Assert.Equal("Task", area.Items[0].Item.Title);
        Assert.Empty(values);
        Assert.Equal("Renamed", page.Editor.Title);
    }

    [Theory]
    [InlineData(DraftDecision.Cancel, "Task", null)]
    [InlineData(DraftDecision.Discard, "Second", null)]
    [InlineData(DraftDecision.Save, "Second", "unsaved")]
    public async Task Changed_custom_values_take_part_in_the_unsaved_changes_guard(
        DraftDecision decision, string expectedOpenItem, string? expectedStoredText)
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, first) = await CreateItemAsync(store);
        await store.Items.CreateAsync(project.Id, null, null, "Second");
        var summary = await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        var dialogs = new FakeDialogService { DraftResult = decision };
        using var page = await OpenItemAsync(store, project, dialogs);
        Input<TextFieldInputViewModel>(page.Editor!, 0).Text = "unsaved";

        await page.SelectItemAsync(page.OpenItems.Single(row => row.Title == "Second"));

        var values = await store.Items.LoadFieldValuesAsync(first.Id);
        var stored = values.SingleOrDefault(value => value.FieldDefinitionId == summary.Id);
        Assert.Equal(expectedOpenItem, page.Editor!.Title);
        Assert.Equal(expectedStoredText, stored?.TextValue);
    }

    [Fact]
    public async Task Choosing_save_in_the_guard_with_an_invalid_number_shows_the_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, _) = await CreateItemAsync(store);
        await store.Items.CreateAsync(project.Id, null, null, "Second");
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var dialogs = new FakeDialogService { DraftResult = DraftDecision.Save };
        using var page = await OpenItemAsync(store, project, dialogs);
        Input<NumberFieldInputViewModel>(page.Editor!, 0).Text = "twelve";

        await page.SelectItemAsync(page.OpenItems.Single(row => row.Title == "Second"));

        Assert.Equal("Fix the custom field values marked in red first.", Assert.Single(dialogs.Messages));
    }

    [Fact]
    public async Task Choosing_save_in_the_guard_with_an_invalid_number_blocks_navigation()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, _) = await CreateItemAsync(store);
        await store.Items.CreateAsync(project.Id, null, null, "Second");
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var dialogs = new FakeDialogService { DraftResult = DraftDecision.Save };
        using var page = await OpenItemAsync(store, project, dialogs);
        Input<NumberFieldInputViewModel>(page.Editor!, 0).Text = "twelve";

        await page.SelectItemAsync(page.OpenItems.Single(row => row.Title == "Second"));

        Assert.Equal("Task", page.Editor!.Title);
        Assert.Equal("twelve", Input<NumberFieldInputViewModel>(page.Editor, 0).Text);
    }

    [Fact]
    public async Task The_latest_selection_wins_when_an_earlier_editor_finishes_loading_last()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, first) = await CreateItemAsync(store);
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var loader = new ControllableFieldLoader();
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, loader);
        await page.LoadAsync();
        var firstRow = page.OpenItems.Single(row => row.Id == first.Id);
        var secondRow = page.OpenItems.Single(row => row.Id == second.Id);
        var selectFirst = page.SelectItemAsync(firstRow);
        var selectSecond = page.SelectItemAsync(secondRow);

        loader.Complete(second.Id);
        loader.Complete(first.Id);
        await Task.WhenAll(selectFirst, selectSecond);

        Assert.Equal(second.Id, page.Editor!.Id);
        Assert.True(secondRow.IsSelected);
        Assert.False(firstRow.IsSelected);
    }

    [Fact]
    public async Task An_earlier_editor_finishing_last_does_not_replace_the_editor_of_a_reload()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, first) = await CreateItemAsync(store);
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var loader = new ControllableFieldLoader();
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, loader);
        await page.LoadAsync();
        var selectFirst = page.SelectItemAsync(page.OpenItems.Single(row => row.Id == first.Id));
        var reload = page.LoadItemsAsync(second.Id);
        await loader.WaitForRequestAsync(second.Id);

        loader.Complete(second.Id);
        loader.Complete(first.Id);
        await Task.WhenAll(selectFirst, reload);

        Assert.Equal(second.Id, page.Editor!.Id);
        Assert.True(page.OpenItems.Single(row => row.Id == second.Id).IsSelected);
    }

    [Fact]
    public async Task The_editor_is_not_replaced_until_the_new_editor_has_finished_loading()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, first) = await CreateItemAsync(store);
        var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
        var loader = new ControllableFieldLoader();
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, loader);
        await page.LoadAsync();
        var selectFirst = page.SelectItemAsync(page.OpenItems.Single(row => row.Id == first.Id));
        loader.Complete(first.Id);
        await selectFirst;

        _ = page.SelectItemAsync(page.OpenItems.Single(row => row.Id == second.Id));

        Assert.Equal(first.Id, page.Editor!.Id);
    }

    [Fact]
    public void Only_active_fields_with_a_changed_value_are_reported_as_changed()
    {
        var item = TodoItem.Create(Guid.NewGuid(), null, null, "Task", TimeProvider.System, 0);
        var summary = FieldDefinition.Create("Summary", FieldDataType.Text, null, 0, []);
        var effort = FieldDefinition.Create("Effort", FieldDataType.Number, null, 1, []);
        var text = new TextFieldInputViewModel(summary, null);
        var number = new NumberFieldInputViewModel(effort, null);
        var editor = new ItemEditorViewModel(item);
        editor.LoadCustomFields([text, number]);

        number.Text = "4";

        Assert.Equal([new FieldValueInput(effort.Id, NumberValue: 4)], editor.ChangedCustomFields);
    }

    private static T Input<T>(ItemEditorViewModel editor, int index)
        where T : CustomFieldInputViewModel
    {
        return Assert.IsType<T>(editor.CustomFields[index]);
    }

    private static async Task<(Project Project, TodoItem Item)> CreateItemAsync(PresentationTestStore store)
    {
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Task");

        return (project, item);
    }

    private static async Task<ProjectWorkspaceViewModel> OpenItemAsync(PresentationTestStore store,
        Project project, FakeDialogService? dialogs = null)
    {
        var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, dialogs);
        await page.LoadAsync();
        await page.SelectItemAsync(page.OpenItems[0]);

        return page;
    }

    private static ItemEdit EditOf(TodoItem item)
    {
        return new ItemEdit(item.Title, null, null, null, null, null, null, null, null);
    }

    /// <summary>Stores a text value on the item, then archives its field.</summary>
    private static async Task StoreAnArchivedTextValueAsync(PresentationTestStore store, TodoItem item, string text)
    {
        var summary = await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        await store.Items.EditAsync(item.Id, EditOf(item), [new(summary.Id, TextValue: text)]);
        await store.Fields.ArchiveAsync(summary.Id);
    }

    /// <summary>Stores a choice on the item, then archives that choice; returns the choice id.</summary>
    private static async Task<Guid> StoreAnArchivedChoiceAsync(PresentationTestStore store, TodoItem item)
    {
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        var retired = await store.Fields.AddChoiceAsync(status.Id, "Retired");
        await store.Fields.AddChoiceAsync(status.Id, "Ready");
        await store.Items.EditAsync(item.Id, EditOf(item), [new(status.Id, ChoiceId: retired.Id)]);
        await store.Fields.ArchiveChoiceAsync(status.Id, retired.Id);

        return retired.Id;
    }

    private static async Task<FieldSet> CreateOneFieldOfEachTypeAsync(PresentationTestStore store)
    {
        var summary = await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        var effort = await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var review = await store.Fields.CreateAsync("Review date", FieldDataType.Date, null);
        var approved = await store.Fields.CreateAsync("Approved", FieldDataType.Boolean, null);
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        var ready = await store.Fields.AddChoiceAsync(status.Id, "Ready");
        FieldValueInput[] values =
        [
            new(summary.Id, TextValue: "Check cost"),
            new(effort.Id, NumberValue: 3.5),
            new(review.Id, DateValue: new DateOnly(2026, 11, 19)),
            new(approved.Id, BoolValue: true),
            new(status.Id, ChoiceId: ready.Id)
        ];

        return new FieldSet(values, ready);
    }

    private static void FillEveryInput(ItemEditorViewModel editor, FieldChoice ready)
    {
        Input<TextFieldInputViewModel>(editor, 0).Text = "Check cost";
        Input<NumberFieldInputViewModel>(editor, 1).Text = "3.5";
        Input<DateFieldInputViewModel>(editor, 2).Date = new DateTime(2026, 11, 19);
        var boolean = Input<BooleanFieldInputViewModel>(editor, 3);
        boolean.Selected = boolean.Options[1];
        var choice = Input<ChoiceFieldInputViewModel>(editor, 4);
        choice.Selected = choice.Options.Single(option => option.Id == ready.Id);
    }

    private static FieldValueInput ToInput(ItemFieldValue value)
    {
        return new FieldValueInput(value.FieldDefinitionId, value.TextValue, value.NumberValue,
            value.DateValue, value.BoolValue, value.ChoiceId);
    }

    private sealed record FieldSet(FieldValueInput[] StoredValues, FieldChoice Ready);
}