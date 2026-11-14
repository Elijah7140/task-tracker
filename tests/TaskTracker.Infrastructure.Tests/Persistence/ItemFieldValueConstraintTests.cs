#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class ItemFieldValueConstraintTests
{
    [Fact]
    public async Task Database_rejects_rows_with_two_values()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var field = await store.Fields(context).CreateAsync("Text", FieldDataType.Text, null);
        var item = await store.Items(context).CreateAsync(project.Id, null, null, "Item");

        await Assert.ThrowsAsync<SqliteException>(() => context.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, TextValue, NumberValue) VALUES ({item.Id}, {field.Id}, {'a'}, {1.0})"));
    }

    [Fact]
    public async Task Database_rejects_a_choice_from_another_field()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var fields = store.Fields(context);
        var first = await fields.CreateAsync("First", FieldDataType.Choice, null);
        var second = await fields.CreateAsync("Second", FieldDataType.Choice, null);
        var choice = await fields.AddChoiceAsync(second.Id, "Other");
        var item = await store.Items(context).CreateAsync(project.Id, null, null, "Item");

        await Assert.ThrowsAsync<SqliteException>(() => context.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, ChoiceId) VALUES ({item.Id}, {first.Id}, {choice.Id})"));
    }

}