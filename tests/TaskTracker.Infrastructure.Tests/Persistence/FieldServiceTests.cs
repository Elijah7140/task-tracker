#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.Fields;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class FieldServiceTests
{
    [Fact]
    public async Task Built_in_search_keys_receive_collision_suffixes()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var fields = store.Fields(context);

        var title = await fields.CreateAsync("Title", FieldDataType.Text, null);
        var ticket = await fields.CreateAsync("Ticket", FieldDataType.Text, null);

        Assert.Equal("title-2", title.Key);
        Assert.Equal("ticket-2", ticket.Key);
    }

    [Fact]
    public async Task Effective_fields_put_global_fields_before_project_fields()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var fields = store.Fields(context);
        var projectField = await fields.CreateAsync("Local", FieldDataType.Text, project.Id);
        var globalField = await fields.CreateAsync("Global", FieldDataType.Text, null);

        var effective = await fields.ListEffectiveAsync(project.Id);

        Assert.Equal([globalField.Id, projectField.Id], effective.Select(field => field.Id));
    }

    [Fact]
    public async Task Visible_names_are_unique_without_case_or_surrounding_spaces()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var fields = store.Fields(context);
        await fields.CreateAsync("Impact", FieldDataType.Text, null);

        await Assert.ThrowsAsync<DomainRuleException>(() => fields.CreateAsync(" impact ", FieldDataType.Text, project.Id));

        Assert.Single(await fields.ListEffectiveAsync(project.Id));
    }

    [Fact]
    public async Task Project_name_blocks_a_later_global_field()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var fields = store.Fields(context);
        await fields.CreateAsync("Impact", FieldDataType.Text, project.Id);

        await Assert.ThrowsAsync<DomainRuleException>(() => fields.CreateAsync("IMPACT", FieldDataType.Text, null));
    }

    [Fact]
    public async Task Rename_and_unarchive_recheck_visible_names()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var fields = store.Fields(context);
        var first = await fields.CreateAsync("First", FieldDataType.Text, null);
        var second = await fields.CreateAsync("Second", FieldDataType.Text, null);

        await Assert.ThrowsAsync<DomainRuleException>(() => fields.RenameAsync(second.Id, " first "));
        await fields.ArchiveAsync(first.Id);
        await fields.RenameAsync(second.Id, "First");
        await Assert.ThrowsAsync<DomainRuleException>(() => fields.UnarchiveAsync(first.Id));
        await using var reader = store.Open();

        Assert.True((await reader.FieldDefinitions.SingleAsync(field => field.Id == first.Id)).IsArchived);
    }

    [Fact]
    public async Task Archived_field_reserves_its_key()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var fields = store.Fields(context);
        var first = await fields.CreateAsync("Impact", FieldDataType.Text, null);
        await fields.ArchiveAsync(first.Id);

        var second = await fields.CreateAsync("Impact", FieldDataType.Text, null);

        Assert.Equal("impact-2", second.Key);
    }

    [Fact]
    public async Task Choice_rename_and_unarchive_recheck_labels()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var fields = store.Fields(context);
        var field = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        var first = await fields.AddChoiceAsync(field.Id, "First");
        var second = await fields.AddChoiceAsync(field.Id, "Second");

        await Assert.ThrowsAsync<DomainRuleException>(() => fields.RenameChoiceAsync(field.Id, second.Id, " first "));
        await fields.ArchiveChoiceAsync(field.Id, first.Id);
        await fields.RenameChoiceAsync(field.Id, second.Id, "First");
        await Assert.ThrowsAsync<DomainRuleException>(() => fields.UnarchiveChoiceAsync(field.Id, first.Id));
        await using var reader = store.Open();

        Assert.True((await reader.FieldChoices.SingleAsync(choice => choice.Id == first.Id)).IsArchived);
    }

    [Fact]
    public async Task Reorder_includes_archived_rows_in_the_given_scope()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var fields = store.Fields(context);
        var first = await fields.CreateAsync("First", FieldDataType.Text, project.Id);
        var second = await fields.CreateAsync("Second", FieldDataType.Text, project.Id);
        await fields.ArchiveAsync(first.Id);

        await fields.ReorderAsync(project.Id, [second.Id, first.Id]);
        await using var reader = store.Open();

        Assert.Equal(0, (await reader.FieldDefinitions.SingleAsync(field => field.Id == second.Id)).SortOrder);
        Assert.Equal(1, (await reader.FieldDefinitions.SingleAsync(field => field.Id == first.Id)).SortOrder);
    }

    [Fact]
    public async Task Field_mutation_waits_for_the_shared_write_gate()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var gate = new FieldWriteGate();
        var service = new FieldService(new TestUnitOfWorkFactory(context), gate);
        var firstLease = await gate.EnterAsync();

        var pending = service.CreateAsync("Waiting", FieldDataType.Text, null);

        Assert.False(pending.IsCompleted);
        firstLease.Dispose();
        var field = await pending;
        await using var reader = store.Open();

        Assert.Equal(field.Id, (await reader.FieldDefinitions.SingleAsync()).Id);
    }












}