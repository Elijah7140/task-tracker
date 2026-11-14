using TaskTracker.Core.Calendar;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Calendar;

/// <summary>Calendar service settings and unit-of-work integration.</summary>
public sealed class CalendarServiceTests
{
    [Fact]
    public async Task Project_thresholds_override_global_thresholds()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        var item = TodoItem.Create(project.Id, null, null, "Due", store.Clock);
        item.SetDue(new DateOnly(2026, 11, 16), null, store.Clock);
        database.Projects.Add(project);
        database.TodoItems.Add(item);
        database.GlobalSettings.Add(new GlobalSettingRow
        {
            Key = SettingsCatalogue.UrgencyYellowThreshold.Key,
            Value = SettingsCatalogue.UrgencyYellowThreshold.Format(TimeSpan.FromDays(5))
        });
        database.ProjectSettings.Add(new ProjectSettingRow
        {
            ProjectId = project.Id,
            Key = SettingsCatalogue.UrgencyYellowThreshold.Key,
            Value = SettingsCatalogue.UrgencyYellowThreshold.Format(TimeSpan.FromDays(2))
        });
        await database.SaveChangesAsync(TestContext.Current.CancellationToken);
        var service = new CalendarService(new TestUnitOfWorkFactory(database));
        var query = new CalendarQuery(null, new DateOnly(2026, 11, 16),
            new DateOnly(2026, 11, 17), false);

        var entries = await service.LoadAsync(query, TestContext.Current.CancellationToken);

        var entry = Assert.Single(entries);
        Assert.Equal(TimeSpan.FromDays(2), entry.Thresholds.Yellow);
        Assert.Equal(TimeSpan.FromHours(24), entry.Thresholds.Red);
    }
}