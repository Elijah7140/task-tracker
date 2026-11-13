namespace TaskTracker.Core.Persistence;

/// <summary>Stores invariant text values at global and project scope.</summary>
public interface ISettingsStore
{
    Task<IReadOnlyDictionary<string, string>> GetGlobalAsync(CancellationToken cancellationToken);

    Task<IReadOnlyDictionary<string, string>> GetProjectAsync(Guid projectId, CancellationToken cancellationToken);

    Task SetGlobalAsync(string key, string value, CancellationToken cancellationToken);

    Task SetProjectAsync(Guid projectId, string key, string? value, CancellationToken cancellationToken);
}