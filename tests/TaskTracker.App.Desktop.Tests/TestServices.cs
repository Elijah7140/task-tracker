using Avalonia.Controls;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

using TaskTracker.App.Desktop.Dialogs;
using TaskTracker.Core.Persistence;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Creates isolated services with a fixed clock and time zone.</summary>
public static class TestServices
{
    public static FakeTimeProvider Clock => new(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));

    public static TimeZoneInfo TimeZone => TimeZoneInfo.Utc;

    /// <summary>Initializes an isolated SQLite database and returns its disposable service scope.</summary>
    public static async Task<TestServiceScope> CreateAsync(
        Window? dialogOwner = null, IFilePickerService? filePicker = null, IDatabaseBackup? backup = null)
    {
        var databasePath = Path.Combine(Path.GetTempPath(), $"tasktracker-ui-{Guid.NewGuid()}.db");
        var services = CompositionRoot.BuildServices(Clock, TimeZone, databasePath,
            dialogOwner is null ? null : new AvaloniaDialogService(dialogOwner), filePicker, backup);
        using var scope = services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync();
        return new TestServiceScope(services, databasePath);
    }
}