using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Seeds a database whose trash holds a project, a folder, an item and a folder that cannot be restored yet.</summary>
public static class TrashTestData
{
    public const string ProjectName = "Billing DB";

    public const string DeletedProjectName = "Old prototype";

    public const string DeletedFolderName = "Legacy";

    public const string BlockedFolderName = "Archive";

    public const string DeletedItemName = "Add index to Invoice.CustomerId";

    /// <summary>
    /// Creates the project "Billing DB" with a live item, then deletes (an hour apart, oldest first)
    /// an item, the folder "Archive", its parent folder "Legacy", and the project "Old prototype".
    /// "Archive" was deleted before its parent, so Restore is blocked for it.
    /// </summary>
    public static async Task<Guid> SeedAsync(IServiceProvider services)
    {
        var clock = services.GetRequiredService<TimeProvider>() as FakeTimeProvider
            ?? throw new InvalidOperationException("The test composition root must use a fake clock.");
        var projects = services.GetRequiredService<ProjectService>();
        var folders = services.GetRequiredService<FolderService>();
        var items = services.GetRequiredService<ItemService>();
        var project = await projects.CreateAsync(ProjectName);
        await items.CreateAsync(project.Id, null, null, "Review invoice template");
        var legacy = await folders.CreateAsync(project.Id, null, DeletedFolderName);
        var archive = await folders.CreateAsync(project.Id, legacy.Id, BlockedFolderName);
        await items.CreateAsync(project.Id, archive.Id, null, "Export 2019 invoices");
        await items.CreateAsync(project.Id, legacy.Id, null, "Drop unused views");
        var indexItem = await items.CreateAsync(project.Id, null, null, DeletedItemName);
        var prototype = await projects.CreateAsync(DeletedProjectName);
        var prototypeFolder = await folders.CreateAsync(prototype.Id, null, "Experiments");
        await items.CreateAsync(prototype.Id, prototypeFolder.Id, null, "Try event sourcing");
        await items.CreateAsync(prototype.Id, null, null, "Sketch schema");

        await items.DeleteAsync(project.Id, null, indexItem.Id);
        clock.Advance(TimeSpan.FromHours(1));
        await folders.DeleteAsync(project.Id, archive.Id);
        clock.Advance(TimeSpan.FromHours(1));
        await folders.DeleteAsync(project.Id, legacy.Id);
        clock.Advance(TimeSpan.FromHours(1));
        await projects.DeleteAsync(prototype.Id);
        return project.Id;
    }
}