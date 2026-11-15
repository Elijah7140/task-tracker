using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using TaskTracker.Core.Persistence;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure;

/// <summary>Registers SQLite persistence in a service collection.</summary>
public static class DependencyInjection
{
    public static IServiceCollection AddTaskTrackerInfrastructure(this IServiceCollection services, string databasePath)
    {
        services.AddDbContextFactory<TaskTrackerDbContext>(options =>
            TaskTrackerSqliteOptions.Configure(options, $"Data Source={databasePath}"));
        services.AddSingleton<IUnitOfWorkFactory, EfUnitOfWorkFactory>();
        services.AddSingleton<IDatabaseBackup>(provider => new SqliteDatabaseBackup(
            databasePath, provider.GetRequiredService<TimeProvider>(), BackupPool.Import));
        services.AddScoped(provider => new DatabaseInitializer(
            provider.GetRequiredService<TaskTrackerDbContext>(),
            databasePath,
            provider.GetRequiredService<TimeProvider>()));
        return services;
    }
}