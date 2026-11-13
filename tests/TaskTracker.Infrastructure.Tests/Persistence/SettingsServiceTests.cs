#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class SettingsServiceTests
{
    [Fact]
    public async Task Global_threshold_checks_deleted_project_overrides()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var settings = store.Settings(context);
        await settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.UrgencyRedThreshold,
            TimeSpan.FromHours(36));
        var batch = await store.Projects(context).DeleteAsync(project.Id);

        await Assert.ThrowsAsync<InvalidOperationException>(() => settings.SetGlobalAsync(
            SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromHours(30)));
        await store.Projects(context).RestoreAsync(batch);
        await using var reader = store.Open();

        Assert.Null((await reader.Projects.SingleAsync(row => row.Id == project.Id)).DeletedAtUtc);
        Assert.Equal(TimeSpan.FromDays(3), await store.Settings(reader).GetGlobalAsync(
            SettingsCatalogue.UrgencyYellowThreshold));
    }

    [Fact]
    public async Task Enabling_auto_completion_reconciles_items_with_the_setting()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<TaskTrackerDbContext>().UseSqlite(connection).Options;
        await using var database = new TaskTrackerDbContext(options);
        await database.Database.MigrateAsync(cancellationToken);
        var project = Project.Create("Project", TimeProvider.System);
        database.Projects.Add(project);
        await database.SaveChangesAsync(cancellationToken);
        var projectRepository = new EfProjectRepository(database);
        var folderRepository = new EfFolderRepository(database);
        var itemRepository = new EfItemRepository(database);
        var settingsStore = new EfSettingsStore(database);
        var unitOfWork = new EfUnitOfWork(database);
        var settings = new SettingsService(new TestUnitOfWorkFactory(database), TimeProvider.System);
        var items = new ItemService(new TestUnitOfWorkFactory(database), TimeProvider.System, TimeZoneInfo.Utc);
        await settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, false, cancellationToken: cancellationToken);
        var parent = await items.CreateAsync(project.Id, null, null, "Parent", cancellationToken);
        await items.CreateAsync(project.Id, null, parent.Id, "Child", cancellationToken);
        await items.SetCompletedAsync(project.Id, null, parent.Id, true, cancellationToken: cancellationToken);

        var preview = await settings.PreviewGlobalAutoCompleteAsync(cancellationToken);
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, true, cancellationToken: cancellationToken));
        await settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, true, confirmed: true,
            cancellationToken: cancellationToken);
        await using var reader = new TaskTrackerDbContext(options);

        Assert.Equal(1, preview.ParentsToReopen);
        Assert.True(await new SettingsService(new TestUnitOfWorkFactory(reader), TimeProvider.System).GetGlobalAsync(SettingsCatalogue.AutoCompleteParents, cancellationToken));
        var persisted = await reader.TodoItems.SingleAsync(item => item.Id == parent.Id, cancellationToken);
        Assert.Null(persisted.CompletedAtUtc);
    }
    [Fact]
    public async Task Project_override_wins_and_clearing_it_restores_global_source()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Project");
        var settings = store.Settings(writer);
        await settings.SetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(5));
        await settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(2));

        await using var overridden = store.Open();
        var value = await store.Settings(overridden).GetEffectiveAsync(project.Id);
        Assert.Equal(TimeSpan.FromDays(2), value.UrgencyYellowThreshold.Value);
        Assert.Equal(SettingSource.Project, value.UrgencyYellowThreshold.Source);
        await settings.ClearProjectOverrideAsync(project.Id, SettingsCatalogue.UrgencyYellowThreshold);
        await using var inherited = store.Open();
        var inheritedValue = await store.Settings(inherited).GetEffectiveAsync(project.Id);

        Assert.Equal(TimeSpan.FromDays(5), inheritedValue.UrgencyYellowThreshold.Value);
        Assert.Equal(SettingSource.Global, inheritedValue.UrgencyYellowThreshold.Source);
    }

    [Fact]
    public async Task Invalid_global_threshold_that_breaks_project_override_saves_nothing()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Project");
        var settings = store.Settings(writer);
        await settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.UrgencyRedThreshold, TimeSpan.FromDays(2));

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            settings.SetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(1)));
        await using var reader = store.Open();
        var saved = await store.Settings(reader).GetEffectiveAsync(project.Id);

        Assert.Equal(TimeSpan.FromDays(3), saved.UrgencyYellowThreshold.Value);
        Assert.Equal(TimeSpan.FromDays(2), saved.UrgencyRedThreshold.Value);
        Assert.Empty(await reader.GlobalSettings.ToListAsync());
    }

    [Fact]
    public async Task Global_enabling_reconciles_inheriting_projects_and_skips_disabled_override()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var projects = store.Projects(writer);
        var inherited = await projects.CreateAsync("Inherited");
        var overridden = await projects.CreateAsync("Overridden");
        var settings = store.Settings(writer);
        await settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, false);
        await settings.SetProjectOverrideAsync(overridden.Id, SettingsCatalogue.AutoCompleteParents, false);
        var items = store.Items(writer);
        var inheritedParent = await items.CreateAsync(inherited.Id, null, null, "Parent");
        await items.CreateAsync(inherited.Id, null, inheritedParent.Id, "Child");
        await items.SetCompletedAsync(inherited.Id, null, inheritedParent.Id, true);
        var overriddenParent = await items.CreateAsync(overridden.Id, null, null, "Parent");
        await items.CreateAsync(overridden.Id, null, overriddenParent.Id, "Child");
        await items.SetCompletedAsync(overridden.Id, null, overriddenParent.Id, true);

        var preview = await settings.PreviewGlobalAutoCompleteAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, true));
        await using var unconfirmed = store.Open();
        Assert.False(await store.Settings(unconfirmed).GetGlobalAsync(SettingsCatalogue.AutoCompleteParents));
        await settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, true, confirmed: true);
        await using var reader = store.Open();

        Assert.Equal(1, preview.ParentsToReopen);
        Assert.Null((await reader.TodoItems.SingleAsync(row => row.Id == inheritedParent.Id)).CompletedAtUtc);
        Assert.NotNull((await reader.TodoItems.SingleAsync(row => row.Id == overriddenParent.Id)).CompletedAtUtc);
    }
}