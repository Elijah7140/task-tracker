using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Undo;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Checks the commit signals a unit of work publishes after saving through real SQLite.</summary>
public sealed class EfUnitOfWorkTests
{
    [Fact]
    public async Task Only_a_commit_that_changes_a_global_setting_raises_the_settings_signal()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        var saved = new DataSaved();
        var units = new EfUnitOfWorkFactory(new StoreContexts(store), NullUndoRecorder.Instance, saved);
        var commits = 0;
        var settingsCommits = 0;
        saved.Committed += () => commits++;
        saved.GlobalSettingsCommitted += () => settingsCommits++;

        var cancellation = TestContext.Current.CancellationToken;

        await new ProjectService(units, store.Clock, TimeZoneInfo.Utc).CreateAsync("Project", cancellation);
        await new SettingsService(units, store.Clock).SetGlobalAsync(SettingsCatalogue.KeepRunningInTray, true,
            cancellationToken: cancellation);

        Assert.Equal(2, commits);
        Assert.Equal(1, settingsCommits);
    }

    private sealed class StoreContexts(SqliteTestStore store) : IDbContextFactory<TaskTrackerDbContext>
    {
        public TaskTrackerDbContext CreateDbContext()
        {
            return store.Open();
        }
    }
}