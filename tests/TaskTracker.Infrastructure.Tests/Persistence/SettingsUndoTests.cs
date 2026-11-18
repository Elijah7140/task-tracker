#pragma warning disable xUnit1051
using TaskTracker.Core;
using TaskTracker.Core.Settings;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>SQLite replay of global settings and composite-keyed project overrides.</summary>
public sealed class SettingsUndoTests
{
    [Fact]
    public async Task Startup_only_bulk_save_does_not_record_an_undo_step()
    {
        await using var world = await UndoWorld.CreateAsync();
        var reminders = new ReminderPreferences(SettingsCatalogue.RemindersEnabled.DefaultValue,
            SettingsCatalogue.DefaultReminderOffset.DefaultValue, SettingsCatalogue.DateOnlyReminderTime.DefaultValue,
            SettingsCatalogue.KeepRunningInTray.DefaultValue);

        await world.Settings.SaveGlobalAsync(true, TimeSpan.FromDays(3), TimeSpan.FromHours(24),
            reminders: reminders, startWithSystem: true);

        Assert.True(await world.Settings.GetGlobalAsync(SettingsCatalogue.StartWithSystem));
        Assert.False(world.History.CanUndo);
        Assert.Empty(world.Recorder.Descriptions);
        await using var database = world.OpenContext();
        Assert.Equal(SettingsCatalogue.StartWithSystem.Key, Assert.Single(database.GlobalSettings).Key);
    }

    [Fact]
    public async Task Redo_refuses_reconciliation_when_the_project_now_opts_out()
    {
        await using var world = await UndoWorld.CreateAsync();
        var projectId = world.Project.Id;
        await world.Settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, false);
        var parent = await world.Items.CreateAsync(projectId, null, null, "Parent");
        var child = await world.Items.CreateAsync(projectId, null, parent.Id, "Child");
        await world.Items.SetCompletedAsync(projectId, null, child.Id, true);
        await world.Settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, true, confirmed: true);
        Assert.NotNull((await world.ReadItemAsync(parent.Id)).CompletedAtUtc);
        await world.History.UndoAsync();

        var message = await world.VerifyRefusalAsync(
            "INSERT INTO ProjectSetting (ProjectId, Key, Value) SELECT Id, 'autoCompleteParents', 'false' FROM Project",
            redo: true, "GlobalSetting", "ProjectSetting", "TodoItem");

        Assert.Contains("automatic completion", message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Saving_global_defaults_round_trips_all_settings_in_one_step()
    {
        await using var world = await UndoWorld.CreateAsync();
        var reminders = new ReminderPreferences(false, TimeSpan.FromMinutes(30), new TimeOnly(10, 0), true);

        await world.VerifyRoundTripAsync(
            () => world.Settings.SaveGlobalAsync(false, TimeSpan.FromDays(2), TimeSpan.FromHours(12), reminders: reminders),
            "GlobalSetting");
        await world.VerifyRefusalAsync("UPDATE GlobalSetting SET Value = 'true' WHERE Key = 'remindersEnabled'",
            redo: false, "GlobalSetting");
    }

    [Theory]
    [InlineData("save")]
    [InlineData("set")]
    [InlineData("clear")]
    public async Task Project_override_changes_round_trip_and_refuse_a_changed_row(string operation)
    {
        await using var world = await UndoWorld.CreateAsync();
        var id = world.Project.Id;
        if (operation == "clear")
        {
            await world.Settings.SetProjectOverrideAsync(id, SettingsCatalogue.AutoCompleteParents, false);
        }

        await world.VerifyRoundTripAsync(() => EditProjectAsync(world.Settings, id, operation), "ProjectSetting");

        var clearing = operation == "clear";
        if (clearing)
        {
            await world.History.UndoAsync();
        }

        await world.VerifyRefusalAsync("UPDATE ProjectSetting SET Value = 'true' WHERE Key = 'autoCompleteParents'",
            redo: clearing, "ProjectSetting");
    }

    [Fact]
    public async Task Undo_refuses_global_thresholds_that_conflict_with_later_project_overrides()
    {
        await using var world = await UndoWorld.CreateAsync();
        await world.Settings.SetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(5));

        await world.VerifyRefusalAsync(
            "INSERT INTO ProjectSetting (ProjectId, Key, Value) SELECT Id, 'urgencyRedThreshold', 'P4D' FROM Project",
            redo: false, "GlobalSetting", "ProjectSetting");
    }

    private static Task EditProjectAsync(SettingsService service, Guid id, string operation)
    {
        return operation switch
        {
            "save" => service.SaveProjectAsync(id, false, TimeSpan.FromDays(4), TimeSpan.FromHours(16)),
            "set" => service.SetProjectOverrideAsync(id, SettingsCatalogue.AutoCompleteParents, false),
            "clear" => service.ClearProjectOverrideAsync(id, SettingsCatalogue.AutoCompleteParents, confirmed: true),
            _ => throw new ArgumentOutOfRangeException(nameof(operation))
        };
    }
}