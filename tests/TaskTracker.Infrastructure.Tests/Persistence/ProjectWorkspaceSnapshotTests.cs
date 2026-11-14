#pragma warning disable xUnit1051
using TaskTracker.Core;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class ProjectWorkspaceSnapshotTests
{
    [Fact]
    public async Task Loading_a_workspace_reads_its_name_and_nested_folders_from_fresh_context()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Billing");
        var parent = await store.Folders(writer).CreateAsync(project.Id, null, "dbo");
        var child = await store.Folders(writer).CreateAsync(project.Id, parent.Id, "Tables");
        await using var reader = store.Open();

        var snapshot = await store.Projects(reader).LoadWorkspaceAsync(project.Id);

        Assert.Equal("Billing", snapshot.Name);
        Assert.Equal(parent.Id, Assert.Single(snapshot.Folders.Children(null)).Id);
        Assert.Equal(child.Id, Assert.Single(snapshot.Folders.Children(parent.Id)).Id);
    }

    [Fact]
    public async Task Loading_a_deleted_project_reports_a_rule_violation()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Billing");
        await store.Projects(writer).DeleteAsync(project.Id);
        await using var reader = store.Open();

        var exception = await Assert.ThrowsAsync<DomainRuleException>(
            () => store.Projects(reader).LoadWorkspaceAsync(project.Id));

        Assert.Contains("missing or deleted", exception.Message);
    }
}