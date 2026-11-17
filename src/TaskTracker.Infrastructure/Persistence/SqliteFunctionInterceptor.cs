using System.Data.Common;

using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore.Diagnostics;

using TaskTracker.Core.Search.Syntax;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Registers the functions used by SQLite queries and migrations.</summary>
internal sealed class SqliteFunctionInterceptor : DbConnectionInterceptor
{
    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        Register(connection);
    }

    public override Task ConnectionOpenedAsync(DbConnection connection,
        ConnectionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        Register(connection);
        return Task.CompletedTask;
    }

    internal static void Register(DbConnection? connection)
    {
        if (connection is SqliteConnection sqlite)
        {
            sqlite.CreateFunction<string?, string?>("tt_fold", TextFolding.Fold, isDeterministic: true);
            sqlite.CreateFunction<string, string, string, string>(
                "tt_rename_query_field", QueryFieldKeyRewriter.Rename, isDeterministic: true);
        }
    }
}