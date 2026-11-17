using System.Globalization;

using TaskTracker.Core.Trash;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>One row of the trash: a deletion batch with its text ready to display.</summary>
public sealed class TrashBatchViewModel : ViewModelBase
{
    private const string PathSeparator = " › ";

    private readonly TrashBatch batch;
    private readonly TimeZoneInfo zone;
    private readonly CultureInfo culture;

    public TrashBatchViewModel(TrashBatch batch, TimeZoneInfo zone, CultureInfo culture)
    {
        this.batch = batch;
        this.zone = zone;
        this.culture = culture;
    }

    public Guid BatchId => batch.BatchId;

    public Guid ProjectId => batch.ProjectId;

    public TrashNodeKind Kind => batch.Kind;

    public string Title => batch.Title;

    /// <summary>"Project", "Folder" or "Item".</summary>
    public string KindLabel => batch.Kind.ToString();

    /// <summary>Where the node was: project and folder names joined by ›, or Home for a project.</summary>
    public string Location => batch.Path.Count == 0 ? "Home" : string.Join(PathSeparator, batch.Path);

    /// <summary>The deletion time in the page's time zone, formatted for the page's culture.</summary>
    public string DeletedText => TimeZoneInfo.ConvertTimeFromUtc(batch.DeletedAtUtc, zone).ToString("g", culture);

    /// <summary>For example "2 folders, 5 items".</summary>
    public string ContentsText => DescribeContents();

    public bool CanRestore => batch.CanRestore;

    /// <summary>Why Restore is disabled, or null when it is available.</summary>
    public string? RestoreBlockedReason => batch.RestoreBlockedReason;

    public bool HasRestoreBlockedReason => batch.RestoreBlockedReason is not null;

    private string DescribeContents()
    {
        var parts = new List<string>();

        if (batch.FolderCount > 0)
        {
            parts.Add(Count(batch.FolderCount, "folder"));
        }

        if (batch.ItemCount > 0)
        {
            parts.Add(Count(batch.ItemCount, "item"));
        }

        return parts.Count == 0 ? "Empty" : string.Join(", ", parts);
    }

    private static string Count(int count, string noun)
    {
        return count == 1 ? $"1 {noun}" : $"{count} {noun}s";
    }
}