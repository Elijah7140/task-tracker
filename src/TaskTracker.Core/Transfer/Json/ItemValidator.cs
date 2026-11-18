using System.Text.Json;

using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;

using TaskTracker.Core.Reminders;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// Checks one project's items: required fields, §5.1 hierarchy invariants, lookup references,
/// date rules and custom values.
/// </summary>
internal sealed class ItemValidator(ImportIndex index, IssueList issues, HashSet<Guid> seenItemIds)
{
    private readonly ItemValueValidator valueValidator = new(index, issues);
    private readonly ItemLinkValidator linkValidator = new(issues);

    public void Validate(ProjectDocument project, string path)
    {
        var items = project.Items.OrEmpty();
        var folderIds = project.Folders.OrEmpty().Where(folder => folder.Id is not null)
            .Select(folder => folder.Id!.Value).ToHashSet();
        var byId = items.Where(item => item.Id is not null)
            .GroupBy(item => item.Id!.Value)
            .ToDictionary(group => group.Key, group => group.First());

        for (var position = 0; position < items.Count; position++)
        {
            var itemPath = ImportChecks.Element(path, position);
            ValidateIdentity(items[position], itemPath);
            ValidateLookups(items[position], itemPath);
            ValidateStatus(items[position], itemPath);
            ValidateDates(items[position], itemPath);
            ValidateRecurrence(items[position], itemPath);
            ValidateReminder(items[position], itemPath);
            ValidatePlacement(items[position], itemPath, folderIds, byId);
            valueValidator.Validate(items[position].FieldValues.OrEmpty(), project.Id, $"{itemPath}.fieldValues");
            linkValidator.Validate(items[position].Links, $"{itemPath}.links");
        }
    }

    private void ValidateIdentity(ItemDocument item, string path)
    {
        ImportChecks.CheckId(item.Id, $"{path}.id", seenItemIds, issues);
        ImportChecks.CheckName(item.Title, TodoItem.TitleMaxLength, $"{path}.title", issues);

        if (!TodoItem.IsTicketNumberValid(item.TicketNumber))
        {
            issues.Add($"{path}.ticketNumber", $"The ticket number must be {TodoItem.TicketNumberMaxLength} characters or fewer.");
        }

        TimestampChecks.Check(item.CreatedAtUtc, $"{path}.createdAtUtc", issues);
        TimestampChecks.Check(item.UpdatedAtUtc, $"{path}.updatedAtUtc", issues);
        TimestampChecks.Check(item.CompletedAtUtc, $"{path}.completedAtUtc", issues);
    }

    private void ValidateLookups(ItemDocument item, string path)
    {
        var hasType = item.ItemTypeId is not null || !string.IsNullOrWhiteSpace(item.ItemType);
        var hasPriority = item.PriorityLevelId is not null || !string.IsNullOrWhiteSpace(item.Priority);

        if (hasType && index.FindItemType(item) is null)
        {
            issues.Add($"{path}.itemType", "The item type is not in this file's item types.");
        }

        if (hasPriority && index.FindPriority(item) is null)
        {
            issues.Add($"{path}.priority", "The priority is not in this file's priority levels.");
        }
    }

    /// <summary>
    /// The status must be one of the file's statuses and agree with completion; a remembered reopen
    /// status must be an Open status of the file on a completed item (§7.15).
    /// </summary>
    private void ValidateStatus(ItemDocument item, string path)
    {
        var completed = item.CompletedAtUtc is not null;
        var expectedKind = completed ? StatusKind.Done : StatusKind.Open;
        if (item.StatusId is Guid statusId && KindOf(statusId) != expectedKind)
        {
            var message = completed ? "Expected a Done status in this file." : "Expected an Open status in this file.";
            issues.Add($"{path}.statusId", message);
        }

        if (item.ReopenStatusId is Guid reopenId && (!completed || KindOf(reopenId) != StatusKind.Open))
        {
            issues.Add($"{path}.reopenStatusId", "Only completed items can remember an Open status from this file.");
        }
    }

    private StatusKind? KindOf(Guid statusId)
    {
        return LookupValidator.ReadStatusKind(index.FindStatus(statusId)?.Kind);
    }

    private void ValidateReminder(ItemDocument item, string path)
    {
        if (!ReminderTiming.IsValid(item.ReminderMode, item.ReminderOffsetMinutes))
        {
            issues.Add($"{path}.reminderOffsetMinutes", "Choose a supported offset for offset mode only.");
        }
    }

    private void ValidateRecurrence(ItemDocument item, string path)
    {
        if (item.RecurrenceSeriesId == Guid.Empty || (item.Recurrence is null && item.RecurrenceSeriesId.HasValue))
        {
            issues.Add($"{path}.recurrenceSeriesId", "A series ID must be nonempty and belong to a repeat rule.");
        }

        if (item.Recurrence is not { } rule)
        {
            return;
        }

        if (item.DueDate is null && item.ScheduledStart is null)
        {
            issues.Add($"{path}.recurrence", "A repeating item needs a due date or a scheduled start.");
        }

        foreach (var error in rule.ValidationErrors())
        {
            var property = JsonNamingPolicy.CamelCase.ConvertName(error.Property);
            issues.Add($"{path}.recurrence.{property}", error.Message);
        }
    }

    private void ValidateDates(ItemDocument item, string path)
    {
        CheckDue(item, path);
        CheckSchedule(item, path);
    }

    private void CheckDue(ItemDocument item, string path)
    {
        if (item.DueDate is not null && !TransferTimeFormat.TryParseDate(item.DueDate, out _))
        {
            issues.Add($"{path}.dueDate", "Expected a date such as 2026-11-13.");
        }

        if (item.DueTime is not null && !TransferTimeFormat.TryParseTime(item.DueTime, out _))
        {
            issues.Add($"{path}.dueTime", "Expected a time such as 15:00:00.");
        }

        if (item.DueTime is not null && item.DueDate is null)
        {
            issues.Add($"{path}.dueTime", "A due time needs a due date.");
        }
    }

    private void CheckSchedule(ItemDocument item, string path)
    {
        var startIsValid = CheckLocal(item.ScheduledStart, $"{path}.scheduledStart");
        var endIsValid = CheckLocal(item.ScheduledEnd, $"{path}.scheduledEnd");

        if (item.ScheduledEnd is not null && item.ScheduledStart is null)
        {
            issues.Add($"{path}.scheduledEnd", "A scheduled end needs a scheduled start.");
        }

        if (startIsValid && endIsValid && ImportParse.Local(item.ScheduledEnd) < ImportParse.Local(item.ScheduledStart))
        {
            issues.Add($"{path}.scheduledEnd", "The scheduled end must not be before the start.");
        }
    }

    private bool CheckLocal(string? text, string path)
    {
        if (text is not null && !TransferTimeFormat.TryParseLocal(text, out _))
        {
            issues.Add(path, "Expected a local date and time without offset, such as 2026-11-13T15:00:00.");
            return false;
        }

        return text is not null;
    }

    private void ValidatePlacement(ItemDocument item, string path, HashSet<Guid> folderIds,
        Dictionary<Guid, ItemDocument> byId)
    {
        if (item.FolderId is Guid folderId && !folderIds.Contains(folderId))
        {
            issues.Add($"{path}.folderId", $"The folder {folderId} is not in this project.");
        }

        if (item.ParentItemId is not Guid parentId)
        {
            return;
        }

        if (!byId.TryGetValue(parentId, out var parent))
        {
            issues.Add($"{path}.parentItemId", $"The parent item {parentId} is not in this project.");
        }
        else if (ImportCycles.FormsCycle(item, byId, other => other.Id, other => other.ParentItemId))
        {
            issues.Add($"{path}.parentItemId", "The item would be a sub-item of itself.");
        }
        else if (parent.FolderId != item.FolderId)
        {
            issues.Add($"{path}.folderId", "A sub-item must be in the same folder as its parent item.");
        }
    }
}