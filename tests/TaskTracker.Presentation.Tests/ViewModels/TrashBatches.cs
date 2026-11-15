using TaskTracker.Core.Trash;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Builds <see cref="TrashBatch"/> values for ViewModel tests.</summary>
internal static class TrashBatches
{
    public static readonly Guid FirstProject = Guid.CreateVersion7();

    public static readonly Guid SecondProject = Guid.CreateVersion7();

    public static TrashBatch Item(string title, Guid? projectId = null, DateTime? deletedAtUtc = null,
        string[]? path = null, string? blockedReason = null)
    {
        var owner = projectId ?? FirstProject;
        return new TrashBatch(Guid.CreateVersion7(), TrashNodeKind.Item, Guid.CreateVersion7(), title, owner,
            path ?? ["Billing"], deletedAtUtc ?? new DateTime(2026, 11, 13, 12, 0, 0, DateTimeKind.Utc), 0, 1,
            blockedReason);
    }

    public static TrashBatch Folder(string title, Guid? projectId = null, DateTime? deletedAtUtc = null)
    {
        var owner = projectId ?? FirstProject;
        return new TrashBatch(Guid.CreateVersion7(), TrashNodeKind.Folder, Guid.CreateVersion7(), title, owner,
            ["Billing"], deletedAtUtc ?? new DateTime(2026, 11, 13, 12, 0, 0, DateTimeKind.Utc), 2, 5, null);
    }

    public static TrashBatch Project(string title, Guid? projectId = null)
    {
        var owner = projectId ?? SecondProject;
        return new TrashBatch(Guid.CreateVersion7(), TrashNodeKind.Project, owner, title, owner, [],
            new DateTime(2026, 11, 13, 12, 0, 0, DateTimeKind.Utc), 1, 3, null);
    }
}