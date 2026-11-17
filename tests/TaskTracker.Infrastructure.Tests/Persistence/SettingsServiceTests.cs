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

        await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() => settings.SetGlobalAsync(
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
        var unitOfWork = new TestUnitOfWorkFactory(database).Begin();
        var settings = new SettingsService(new TestUnitOfWorkFactory(database), TimeProvider.System);
        var items = new ItemService(new TestUnitOfWorkFactory(database), TimeProvider.System, TimeZoneInfo.Utc);
        await settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, false, cancellationToken: cancellationToken);
        var parent = await items.CreateAsync(project.Id, null, null, "Parent", cancellationToken);
        await items.CreateAsync(project.Id, null, parent.Id, "Child", cancellationToken);
        await items.SetCompletedAsync(project.Id, null, parent.Id, true, cancellationToken: cancellationToken);

        var preview = await settings.PreviewGlobalAutoCompleteAsync(cancellationToken);
        await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() =>
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

        await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() =>
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
        await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() =>
            settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, true));
        await using var unconfirmed = store.Open();
        Assert.False(await store.Settings(unconfirmed).GetGlobalAsync(SettingsCatalogue.AutoCompleteParents));
        await settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, true, confirmed: true);
        await using var reader = store.Open();

        Assert.Equal(1, preview.ParentsToReopen);
        Assert.Null((await reader.TodoItems.SingleAsync(row => row.Id == inheritedParent.Id)).CompletedAtUtc);
        Assert.NotNull((await reader.TodoItems.SingleAsync(row => row.Id == overriddenParent.Id)).CompletedAtUtc);
    }

    [Fact]
    public async Task Saving_global_defaults_persists_all_three_values_together()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();

        await store.Settings(writer).SaveGlobalAsync(false, TimeSpan.FromDays(5), TimeSpan.FromHours(48));
        await using var reader = store.Open();
        var settings = store.Settings(reader);

        Assert.False(await settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents));
        Assert.Equal(TimeSpan.FromDays(5), await settings.GetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold));
        Assert.Equal(TimeSpan.FromHours(48), await settings.GetGlobalAsync(SettingsCatalogue.UrgencyRedThreshold));
    }

    [Fact]
    public async Task Saving_global_defaults_with_an_invalid_combination_persists_nothing()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();

        await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() => store.Settings(writer)
            .SaveGlobalAsync(false, TimeSpan.FromDays(1), TimeSpan.FromHours(48)));
        await using var reader = store.Open();

        Assert.Empty(await reader.GlobalSettings.ToListAsync());
    }

    [Fact]
    public async Task Saving_global_defaults_that_conflict_with_a_project_override_names_the_project()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Billing DB");
        var settings = store.Settings(writer);
        await settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromHours(36));

        var failure = await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() =>
            settings.SaveGlobalAsync(true, TimeSpan.FromDays(3), TimeSpan.FromHours(48)));

        Assert.Equal("Project 'Billing DB' overrides the yellow threshold to 36 hours, so the red threshold can't exceed it.",
            failure.Message);
    }

    [Fact]
    public async Task Global_conflict_with_a_red_override_names_the_project_and_the_yellow_threshold()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Billing DB");
        var settings = store.Settings(writer);
        await settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.UrgencyRedThreshold, TimeSpan.FromDays(2));

        var failure = await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() =>
            settings.SaveGlobalAsync(true, TimeSpan.FromDays(1), TimeSpan.FromHours(12)));

        Assert.Equal("Project 'Billing DB' overrides the red threshold to 2 days, so the yellow threshold can't be lower than it.",
            failure.Message);
    }

    [Fact]
    public async Task Enabling_auto_completion_without_confirmation_persists_nothing()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var parentId = await CreateCompletedParentWithOpenChildAsync(store, writer);
        var settings = store.Settings(writer);

        await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() =>
            settings.SaveGlobalAsync(true, TimeSpan.FromDays(4), TimeSpan.FromHours(30), confirmed: false));
        await using var reader = store.Open();

        Assert.False(await store.Settings(reader).GetGlobalAsync(SettingsCatalogue.AutoCompleteParents));
        Assert.Equal(TimeSpan.FromDays(3), await store.Settings(reader).GetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold));
        Assert.NotNull((await reader.TodoItems.SingleAsync(item => item.Id == parentId)).CompletedAtUtc);
    }

    [Fact]
    public async Task Confirmed_global_save_commits_values_and_reconciliation_together()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var parentId = await CreateCompletedParentWithOpenChildAsync(store, writer);

        await store.Settings(writer).SaveGlobalAsync(true, TimeSpan.FromDays(4), TimeSpan.FromHours(30), confirmed: true);
        await using var reader = store.Open();

        Assert.True(await store.Settings(reader).GetGlobalAsync(SettingsCatalogue.AutoCompleteParents));
        Assert.Equal(TimeSpan.FromDays(4), await store.Settings(reader).GetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold));
        Assert.Null((await reader.TodoItems.SingleAsync(item => item.Id == parentId)).CompletedAtUtc);
    }

    [Fact]
    public async Task Saving_project_overrides_persists_all_three_together_and_null_clears_one()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Billing DB");
        var settings = store.Settings(writer);

        await settings.SaveProjectAsync(project.Id, false, TimeSpan.FromDays(6), TimeSpan.FromHours(12), confirmed: true);
        await settings.SaveProjectAsync(project.Id, false, null, TimeSpan.FromHours(12), confirmed: true);
        await using var reader = store.Open();
        var effective = await store.Settings(reader).GetEffectiveAsync(project.Id);

        Assert.Equal(SettingSource.Project, effective.AutoCompleteParents.Source);
        Assert.False(effective.AutoCompleteParents.Value);
        Assert.Equal(SettingSource.Global, effective.UrgencyYellowThreshold.Source);
        Assert.Equal(TimeSpan.FromHours(12), effective.UrgencyRedThreshold.Value);
    }

    [Fact]
    public async Task Saving_project_overrides_with_an_invalid_combination_persists_nothing()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Billing DB");

        await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() => store.Settings(writer)
            .SaveProjectAsync(project.Id, false, TimeSpan.FromHours(10), TimeSpan.FromHours(20)));
        await using var reader = store.Open();

        Assert.Empty(await reader.ProjectSettings.Where(row => row.ProjectId == project.Id).ToListAsync());
    }

    [Fact]
    public async Task Project_save_that_enables_auto_completion_needs_confirmation_then_reconciles()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var parentId = await CreateCompletedParentWithOpenChildAsync(store, writer);
        var projectId = (await writer.Projects.SingleAsync()).Id;
        var settings = store.Settings(writer);

        await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() =>
            settings.SaveProjectAsync(projectId, true, TimeSpan.FromDays(4), null));
        await using var unconfirmed = store.Open();
        Assert.Empty(await unconfirmed.ProjectSettings.Where(row => row.ProjectId == projectId).ToListAsync());

        await settings.SaveProjectAsync(projectId, true, TimeSpan.FromDays(4), null, confirmed: true);
        await using var confirmed = store.Open();

        Assert.Null((await confirmed.TodoItems.SingleAsync(item => item.Id == parentId)).CompletedAtUtc);
        Assert.Equal(TimeSpan.FromDays(4),
            (await store.Settings(confirmed).GetEffectiveAsync(projectId)).UrgencyYellowThreshold.Value);
    }

    private static async Task<Guid> CreateCompletedParentWithOpenChildAsync(SqliteTestStore store,
        TaskTrackerDbContext writer)
    {
        var project = await store.Projects(writer).CreateAsync("Billing DB");
        await store.Settings(writer).SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, false);
        var items = store.Items(writer);
        var parent = await items.CreateAsync(project.Id, null, null, "Parent");
        await items.CreateAsync(project.Id, null, parent.Id, "Open child");
        await items.SetCompletedAsync(project.Id, null, parent.Id, true);

        return parent.Id;
    }
}