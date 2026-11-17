#pragma warning disable xUnit1051
using TaskTracker.Core.Fields;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;

namespace TaskTracker.Core.Tests.Search;

public sealed class FieldRegistryTests
{
    [Fact]
    public async Task Active_fields_follow_builtin_global_then_project_order()
    {
        var store = new SearchTestUnitOfWork();
        var clock = TimeProvider.System;
        var project = Project.Create("Project", clock);
        var global = FieldDefinition.Create("Global", FieldDataType.Text, null, 0, []);
        var local = FieldDefinition.Create("Local", FieldDataType.Number, project.Id, 0, [global.Key]);
        var archived = FieldDefinition.Create("Archived", FieldDataType.Text, null, 1,
            [global.Key, local.Key]);
        archived.Archive();
        store.ProjectRows.Add(project);
        store.Definitions.AddRange([global, local, archived]);
        var registry = new FieldRegistry(store);

        var fields = await registry.GetFieldsAsync(new SearchScope.Project(project.Id));

        Assert.Equal(["title", "ticket", "type", "priority", "due", "scheduled", "status", "link", "repeats", "global", "local"],
            fields.Select(field => field.Key));
    }
}