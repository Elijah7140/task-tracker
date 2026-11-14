#pragma warning disable xUnit1051
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class CustomFieldInputLoaderTests
{
    [Fact]
    public async Task Global_fields_come_first_then_project_fields_each_in_sort_order()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Task");
        await store.Fields.CreateAsync("Project note", FieldDataType.Text, project.Id);
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        await store.Fields.CreateAsync("Approved", FieldDataType.Boolean, null);

        var inputs = await CreateLoader(store).LoadAsync(project.Id, item.Id);

        Assert.Equal(["Effort", "Approved", "Project note"], inputs.Select(input => input.Name));
    }

    [Fact]
    public async Task Each_field_type_gets_its_own_kind_of_input()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Task");
        await store.Fields.CreateAsync("Summary", FieldDataType.Text, null);
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        await store.Fields.CreateAsync("Review date", FieldDataType.Date, null);
        await store.Fields.CreateAsync("Approved", FieldDataType.Boolean, null);
        await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);

        var inputs = await CreateLoader(store).LoadAsync(project.Id, item.Id);

        Assert.Collection(inputs,
            input => Assert.IsType<TextFieldInputViewModel>(input),
            input => Assert.IsType<NumberFieldInputViewModel>(input),
            input => Assert.IsType<DateFieldInputViewModel>(input),
            input => Assert.IsType<BooleanFieldInputViewModel>(input),
            input => Assert.IsType<ChoiceFieldInputViewModel>(input));
    }

    [Fact]
    public async Task Stored_values_are_loaded_into_the_inputs()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Task");
        var effort = await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        var status = await store.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        var ready = await store.Fields.AddChoiceAsync(status.Id, "Ready");
        await store.Items.EditAsync(item.Id, EditOf(item),
            [new(effort.Id, NumberValue: 8), new(status.Id, ChoiceId: ready.Id)]);

        var inputs = await CreateLoader(store).LoadAsync(project.Id, item.Id);

        Assert.Equal("8", Assert.IsType<NumberFieldInputViewModel>(inputs[0]).Text);
        Assert.Equal("Ready", Assert.IsType<ChoiceFieldInputViewModel>(inputs[1]).Selected.Label);
    }

    [Fact]
    public async Task Fields_of_other_projects_are_not_loaded()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var billing = await store.Projects.CreateAsync("Billing");
        var website = await store.Projects.CreateAsync("Website");
        var item = await store.Items.CreateAsync(billing.Id, null, null, "Task");
        await store.Fields.CreateAsync("Website only", FieldDataType.Text, website.Id);

        var inputs = await CreateLoader(store).LoadAsync(billing.Id, item.Id);

        Assert.Empty(inputs);
    }

    [Fact]
    public async Task An_archived_field_is_loaded_only_when_the_item_still_has_a_value_for_it()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Task");
        var kept = await store.Fields.CreateAsync("Kept", FieldDataType.Text, null);
        var unused = await store.Fields.CreateAsync("Unused", FieldDataType.Text, null);
        await store.Items.EditAsync(item.Id, EditOf(item), [new(kept.Id, TextValue: "value")]);
        await store.Fields.ArchiveAsync(kept.Id);
        await store.Fields.ArchiveAsync(unused.Id);

        var inputs = await CreateLoader(store).LoadAsync(project.Id, item.Id);

        var archived = Assert.Single(inputs);
        Assert.Equal("Kept", archived.Name);
        Assert.True(archived.IsArchived);
        Assert.Equal("value", archived.DisplayValue);
    }

    private static CustomFieldInputLoader CreateLoader(PresentationTestStore store)
    {
        return new CustomFieldInputLoader(store.Fields, store.Items);
    }

    private static ItemEdit EditOf(TodoItem item)
    {
        return new ItemEdit(item.Title, null, null, null, null, null, null, null, null);
    }
}