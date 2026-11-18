using System.Data.Common;
using System.Globalization;

using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Search;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Runs bounded, parameterized searches against SQLite.</summary>
public sealed class SqlItemSearch(TaskTrackerDbContext database) : IItemSearch
{
    public async Task<ItemSearchResults> SearchAsync(ItemQuery query, IReadOnlyList<SearchableField> fields,
        int limit, CancellationToken cancellationToken)
    {
        await database.Database.OpenConnectionAsync(cancellationToken);
        await using var command = database.Database.GetDbConnection().CreateCommand();
        var builder = new SearchSqlBuilder(command, query, fields, limit);
        command.CommandText = builder.Build();
        var items = new List<ItemSearchResult>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(ReadResult(reader));
        }

        var hasMore = items.Count > limit;

        if (hasMore)
        {
            items.RemoveAt(items.Count - 1);
        }

        return new ItemSearchResults(items, hasMore);
    }

    private static ItemSearchResult ReadResult(DbDataReader reader)
    {
        var itemId = Guid.Parse(reader.GetString(0));
        var projectId = Guid.Parse(reader.GetString(1));
        var projectName = reader.GetString(2);
        var folderId = OptionalGuid(reader, 3);
        var parentItemId = OptionalGuid(reader, 4);
        var title = reader.GetString(5);
        var ticketNumber = reader.IsDBNull(6) ? null : reader.GetString(6);
        var itemTypeId = OptionalGuid(reader, 7);
        var priorityId = OptionalGuid(reader, 8);
        DateOnly? dueDate = reader.IsDBNull(9) ? null : DateOnly.Parse(reader.GetString(9), CultureInfo.InvariantCulture);
        TimeOnly? dueTime = reader.IsDBNull(10) ? null : TimeOnly.Parse(reader.GetString(10), CultureInfo.InvariantCulture);
        var isCompleted = reader.GetInt64(11) != 0;
        return new ItemSearchResult(itemId, projectId, projectName, folderId, parentItemId,
            title, ticketNumber, itemTypeId, priorityId, dueDate, dueTime, isCompleted)
        {
            HasSchedule = reader.GetInt64(12) != 0
        };
    }

    private static Guid? OptionalGuid(DbDataReader reader, int index)
    {
        return reader.IsDBNull(index) ? null : Guid.Parse(reader.GetString(index));
    }
}