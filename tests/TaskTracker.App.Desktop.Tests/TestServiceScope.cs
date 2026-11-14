using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Owns test services and removes their temporary SQLite files on disposal.</summary>
public sealed class TestServiceScope : IServiceProvider, IDisposable
{
    private readonly ServiceProvider services;
    private readonly string databasePath;

    /// <summary>Takes ownership of services and their database file.</summary>
    public TestServiceScope(ServiceProvider services, string databasePath)
    {
        this.services = services;
        this.databasePath = databasePath;
    }

    /// <inheritdoc />
    public object? GetService(Type serviceType)
    {
        return services.GetService(serviceType);
    }

    /// <inheritdoc />
    public void Dispose()
    {
        services.Dispose();
        SqliteConnection.ClearAllPools();
        DeleteIfPresent(databasePath);
        DeleteIfPresent(databasePath + "-wal");
        DeleteIfPresent(databasePath + "-shm");
    }

    private static void DeleteIfPresent(string path)
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }
}