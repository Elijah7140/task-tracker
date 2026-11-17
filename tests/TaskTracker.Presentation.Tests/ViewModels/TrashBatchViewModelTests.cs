using System.Globalization;

using TaskTracker.Core.Trash;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class TrashBatchViewModelTests
{
    private static readonly CultureInfo English = CultureInfo.GetCultureInfo("en-US");

    private static readonly CultureInfo German = CultureInfo.GetCultureInfo("de-DE");

    private static readonly TimeZoneInfo TwoHoursAhead = TimeZoneInfo.CreateCustomTimeZone(
        "Test", TimeSpan.FromHours(2), "Test", "Test");

    [Fact]
    public void Deletion_time_is_shown_in_the_given_zone_and_culture()
    {
        var batch = TrashBatches.Item("Item");

        var localTime = new DateTime(2026, 11, 13, 14, 0, 0);

        var english = new TrashBatchViewModel(batch, TwoHoursAhead, English);
        var german = new TrashBatchViewModel(batch, TwoHoursAhead, German);

        // Expected text comes from the same culture: Linux ICU puts a narrow no-break
        // space before "PM", so a hard-coded string would only pass on Windows.
        Assert.Equal(localTime.ToString("g", English), english.DeletedText);
        Assert.Equal(localTime.ToString("g", German), german.DeletedText);
        Assert.Contains("2:00", english.DeletedText);
        Assert.Contains("14:00", german.DeletedText);
    }

    [Fact]
    public void Location_joins_the_path_and_a_project_is_located_at_home()
    {
        var item = new TrashBatchViewModel(TrashBatches.Item("Item", path: ["Billing", "dbo", "Tables"]),
            TimeZoneInfo.Utc, English);
        var project = new TrashBatchViewModel(TrashBatches.Project("Old project"), TimeZoneInfo.Utc, English);

        Assert.Equal("Billing › dbo › Tables", item.Location);
        Assert.Equal("Home", project.Location);
    }

    [Theory]
    [InlineData(0, 1, "1 item")]
    [InlineData(0, 4, "4 items")]
    [InlineData(1, 0, "1 folder")]
    [InlineData(3, 1, "3 folders, 1 item")]
    [InlineData(1, 2, "1 folder, 2 items")]
    [InlineData(0, 0, "Empty")]
    public void Contents_text_counts_folders_then_items(int folders, int items, string expected)
    {
        var batch = TrashBatches.Item("Item") with { FolderCount = folders, ItemCount = items };

        var row = new TrashBatchViewModel(batch, TimeZoneInfo.Utc, English);

        Assert.Equal(expected, row.ContentsText);
    }

    [Fact]
    public void A_blocked_batch_cannot_be_restored_and_explains_why()
    {
        var batch = TrashBatches.Item("Item", blockedReason: "Restore the folder 'X' first");

        var row = new TrashBatchViewModel(batch, TimeZoneInfo.Utc, English);

        Assert.False(row.CanRestore);
        Assert.True(row.HasRestoreBlockedReason);
        Assert.Equal("Restore the folder 'X' first", row.RestoreBlockedReason);
        Assert.Equal(TrashNodeKind.Item, row.Kind);
        Assert.Equal("Item", row.KindLabel);
    }
}