#pragma warning disable xUnit1051
using TaskTracker.Core.Fields;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Search;

public sealed class FieldRegistryTests
{
    [Fact]
    public async Task Built_ins_precede_active_global_and_project_fields()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var first = Project.Create("First", store.Clock);
        var second = Project.Create("Second", store.Clock);
        var global = FieldDefinition.Create("Global", FieldDataType.Text, null, 0, []);
        var local = FieldDefinition.Create("Local", FieldDataType.Number, first.Id, 0, [global.Key]);
        var other = FieldDefinition.Create("Other", FieldDataType.Date, second.Id, 0,
            [global.Key, local.Key]);
        var archived = FieldDefinition.Create("Archived", FieldDataType.Text, null, 1,
            [global.Key, local.Key, other.Key]);
        archived.Archive();
        database.Projects.AddRange(first, second);
        database.FieldDefinitions.AddRange(global, local, other, archived);
        await database.SaveChangesAsync();
        var registry = new FieldRegistry(new TestUnitOfWorkFactory(database));

        var projectFields = await registry.GetFieldsAsync(new SearchScope.Project(first.Id));
        var allFields = await registry.GetFieldsAsync(new SearchScope.AllProjects());

        Assert.Equal(["title", "ticket", "type", "priority", "due", "scheduled", "status", "link", "repeats", "reminder", "global", "local"],
            projectFields.Select(field => field.Key));
        Assert.Equal(["global", "local", "other"], allFields.Where(field => !field.IsBuiltIn).Select(field => field.Key));
        Assert.IsType<FieldSource.BuiltIn>(projectFields[0].Source);
        Assert.IsType<FieldSource.Custom>(projectFields[10].Source);
    }

    [Fact]
    public async Task Choice_lists_exclude_archived_options_and_follow_sort_order()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var field = FieldDefinition.Create("Category", FieldDataType.Choice, null, 0, []);
        var first = FieldChoice.Create(field.Id, "First", 1);
        var second = FieldChoice.Create(field.Id, "Second", 0);
        var hidden = FieldChoice.Create(field.Id, "Hidden", 2);
        hidden.Archive();
        var type = ItemType.Create("Visible", 0);
        var hiddenType = ItemType.Create("Hidden", 1);
        hiddenType.Archive();
        database.FieldDefinitions.Add(field);
        database.FieldChoices.AddRange(first, second, hidden);
        database.ItemTypes.AddRange(type, hiddenType);
        await database.SaveChangesAsync();
        var registry = new FieldRegistry(new TestUnitOfWorkFactory(database));
        var fields = await registry.GetFieldsAsync(new SearchScope.AllProjects());

        var choices = await registry.GetChoicesAsync(fields.Single(candidate => candidate.Key == field.Key));
        var types = await registry.GetChoicesAsync(fields.Single(candidate => candidate.Key == "type"));

        Assert.Equal(["Second", "First"], choices.Select(choice => choice.Label));
        Assert.Contains(types, choice => choice.Label == "Visible");
        Assert.DoesNotContain(types, choice => choice.Label == "Hidden");
    }
}