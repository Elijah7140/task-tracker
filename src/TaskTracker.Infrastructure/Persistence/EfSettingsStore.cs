using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Persistence;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>EF key/value setting storage.</summary>
public sealed class EfSettingsStore(TaskTrackerDbContext database) : ISettingsStore
{
    public async Task<IReadOnlyDictionary<string, string>> GetGlobalAsync(CancellationToken cancellationToken)
    {
        return await database.GlobalSettings.ToDictionaryAsync(row => row.Key, row => row.Value, cancellationToken);
    }

    public async Task<IReadOnlyDictionary<string, string>> GetProjectAsync(Guid projectId, CancellationToken cancellationToken)
    {
        return await database.ProjectSettings.Where(row => row.ProjectId == projectId)
            .ToDictionaryAsync(row => row.Key, row => row.Value, cancellationToken);
    }

    public async Task SetGlobalAsync(string key, string value, CancellationToken cancellationToken)
    {
        var row = await database.GlobalSettings.FindAsync([key], cancellationToken);

        if (row is null)
        {
            database.GlobalSettings.Add(new GlobalSettingRow { Key = key, Value = value });
            return;
        }

        row.Value = value;
    }

    public async Task SetProjectAsync(Guid projectId, string key, string? value, CancellationToken cancellationToken)
    {
        var row = await database.ProjectSettings.FindAsync([projectId, key], cancellationToken);

        if (value is null)
        {
            if (row is not null)
            {
                database.ProjectSettings.Remove(row);
            }

            return;
        }

        if (row is null)
        {
            database.ProjectSettings.Add(new ProjectSettingRow { ProjectId = projectId, Key = key, Value = value });
            return;
        }

        row.Value = value;
    }
}