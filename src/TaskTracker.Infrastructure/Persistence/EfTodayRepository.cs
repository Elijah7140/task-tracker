using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Today;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Queries the day's completions, their item ancestors, and their folder paths.</summary>
public sealed class EfTodayRepository(TaskTrackerDbContext database) : ITodayRepository
{
    public async Task<IReadOnlyList<TodayItem>> LoadAsync(DateTime startUtc, DateTime endUtc,
        CancellationToken cancellationToken)
    {
        return await database.Database.SqlQuery<TodayItem>($"""
            WITH RECURSIVE
            done(Id) AS (
                SELECT Id FROM TodoItem
                WHERE CompletedAtUtc IS NOT NULL AND DeletedAtUtc IS NULL
                  AND CompletedAtUtc >= {startUtc} AND CompletedAtUtc < {endUtc}
            ),
            branch(Id, ParentItemId) AS (
                SELECT i.Id, i.ParentItemId FROM done JOIN TodoItem i ON i.Id = done.Id
                UNION
                SELECT p.Id, p.ParentItemId FROM branch JOIN TodoItem p ON p.Id = branch.ParentItemId
                WHERE p.DeletedAtUtc IS NULL
            ),
            paths(Id, ParentFolderId, Path) AS (
                SELECT f.Id, f.ParentFolderId, f.Name FROM Folder f
                WHERE f.DeletedAtUtc IS NULL AND f.Id IN (
                    SELECT i.FolderId FROM branch JOIN TodoItem i ON i.Id = branch.Id
                )
                UNION ALL
                SELECT paths.Id, f.ParentFolderId, f.Name || ' › ' || paths.Path
                FROM paths JOIN Folder f ON f.Id = paths.ParentFolderId
                WHERE f.DeletedAtUtc IS NULL
            )
            SELECT i.Id, p.Id AS ProjectId, p.Name AS ProjectName, p.SortOrder AS ProjectOrder,
                i.FolderId, p.Name || coalesce(' › ' || paths.Path, '') AS AreaPath,
                i.ParentItemId, i.Title, i.SortOrder, i.CompletedAtUtc IS NOT NULL AS IsCompleted,
                done.Id IS NOT NULL AS CompletedToday,
                (i.DueDate IS NOT NULL OR i.ScheduledStart IS NOT NULL) AS HasDates
            FROM branch JOIN TodoItem i ON i.Id = branch.Id
            JOIN Project p ON p.Id = i.ProjectId AND p.DeletedAtUtc IS NULL
            LEFT JOIN paths ON paths.Id = i.FolderId AND paths.ParentFolderId IS NULL
            LEFT JOIN done ON done.Id = i.Id
            WHERE i.FolderId IS NULL OR paths.Id IS NOT NULL
            """).ToListAsync(cancellationToken);
    }
}