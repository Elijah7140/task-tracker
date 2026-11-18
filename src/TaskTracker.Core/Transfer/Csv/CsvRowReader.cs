using System.Globalization;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;

namespace TaskTracker.Core.Transfer.Csv;

/// <summary>
/// Reads and validates one record of an import file. Every problem is added to the issue list with
/// the row number and column; a record with any problem produces no row.
/// </summary>
internal sealed class CsvRowReader(
    CsvHeader header, CsvImportContext context, TimeProvider clock, CsvRecord record, IssueList issues)
{

    public CsvImportRow? Read()
    {
        var problemsBefore = issues.Count;
        var title = ReadTitle();
        var ticket = ReadTicket();
        var typeId = ReadLookup(CsvColumns.Type, "type", context.ItemTypes);
        var priorityId = ReadLookup(CsvColumns.Priority, "priority", context.PriorityLevels);
        var (dueDate, dueTime) = ReadDue();
        var (start, end) = ReadSchedule();
        var (statusId, completedAt) = ReadStatusAndCompletion();
        var values = ReadFieldValues();
        var linkUrls = ReadLinks();

        if (issues.Count != problemsBefore)
        {
            return null;
        }

        return new CsvImportRow(record.RowNumber, title, ReadDescription(), ticket, typeId, priorityId, statusId,
            dueDate, dueTime, start, end, completedAt, values, linkUrls);
    }

    private string Cell(string column)
    {
        var index = header.IndexOf(column);

        return index >= 0 && index < record.Cells.Count ? record.Cells[index] : string.Empty;
    }

    private string TextCell(string column)
    {
        return CsvCells.Unprotect(Cell(column));
    }

    private void Fail(string column, string message)
    {
        issues.Add($"Row {record.RowNumber}, {column}", message);
    }

    private string ReadTitle()
    {
        var title = TextCell(CsvColumns.Title).Trim();

        if (title.Length == 0 || title.Length > TodoItem.TitleMaxLength)
        {
            Fail(CsvColumns.Title, $"A title of 1 to {TodoItem.TitleMaxLength} characters is required.");
        }

        return title;
    }

    private string? ReadDescription()
    {
        var description = TextCell(CsvColumns.Description);

        return string.IsNullOrWhiteSpace(description) ? null : description;
    }

    private string? ReadTicket()
    {
        var ticket = TextCell(CsvColumns.Ticket).Trim();

        if (ticket.Length > TodoItem.TicketNumberMaxLength)
        {
            Fail(CsvColumns.Ticket, $"The ticket number must be {TodoItem.TicketNumberMaxLength} characters or fewer.");
        }

        return ticket.Length == 0 ? null : ticket;
    }

    private Guid? ReadLookup<T>(string column, string kind, IReadOnlyList<T> lookups)
        where T : LookupEntity
    {
        var name = TextCell(column).Trim();

        if (name.Length == 0)
        {
            return null;
        }

        var match = lookups.FirstOrDefault(lookup => HasName(lookup, name));

        if (match is null)
        {
            var valid = string.Join(", ", lookups.Where(lookup => !lookup.IsArchived).Select(lookup => lookup.Name));
            Fail(column, $"There is no {kind} named '{name}'. Use one of: {valid}.");
            return null;
        }

        if (match.IsArchived)
        {
            Fail(column, $"The {kind} '{name}' is archived.");
        }

        return match.Id;
    }

    /// <summary>A priority level also answers to its label, such as "7 · Hotfix", which an export writes.</summary>
    private static bool HasName(LookupEntity lookup, string name)
    {
        if (string.Equals(lookup.Name, name, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return lookup is PriorityLevel priority && string.Equals(priority.Label, name, StringComparison.OrdinalIgnoreCase);
    }

    private (DateOnly? Date, TimeOnly? Time) ReadDue()
    {
        var date = ReadDueDate();
        var time = ReadDueTime(date);

        return (date, time);
    }

    private DateOnly? ReadDueDate()
    {
        var text = Cell(CsvColumns.DueDate).Trim();

        if (text.Length == 0)
        {
            return null;
        }

        if (TransferTimeFormat.TryParseDate(text, out var date))
        {
            return date;
        }

        Fail(CsvColumns.DueDate, "Expected a date such as 2026-11-13.");
        return null;
    }

    private TimeOnly? ReadDueTime(DateOnly? date)
    {
        var text = Cell(CsvColumns.DueTime).Trim();

        if (text.Length == 0)
        {
            return null;
        }

        if (!TransferTimeFormat.TryParseTime(text, out var time))
        {
            Fail(CsvColumns.DueTime, "Expected a time such as 15:00.");
            return null;
        }

        if (date is null)
        {
            Fail(CsvColumns.DueTime, "A due time needs a due date.");
        }

        return time;
    }

    private (DateTime? Start, DateTime? End) ReadSchedule()
    {
        var start = ReadLocal(CsvColumns.ScheduledStart);
        var end = ReadLocal(CsvColumns.ScheduledEnd);

        if (end is not null && start is null && Cell(CsvColumns.ScheduledStart).Trim().Length == 0)
        {
            Fail(CsvColumns.ScheduledEnd, "A scheduled end needs a scheduled start.");
        }

        if (start is not null && end is not null && end < start)
        {
            Fail(CsvColumns.ScheduledEnd, "The scheduled end must not be before the start.");
        }

        return (start, end);
    }

    private DateTime? ReadLocal(string column)
    {
        var text = Cell(column).Trim();

        if (text.Length == 0)
        {
            return null;
        }

        if (TransferTimeFormat.TryParseLocal(text, out var value))
        {
            return value;
        }

        Fail(column, "Expected a local date and time such as 2026-11-13T15:00.");
        return null;
    }

    /// <summary>
    /// Reads the Status and completion columns, which must agree (§7.15). A Done status by itself
    /// completes the row, and a completed row without a status gets the first Done status.
    /// </summary>
    private (Guid? StatusId, DateTime? CompletedAt) ReadStatusAndCompletion()
    {
        var statusId = ReadLookup(CsvColumns.Status, "status", context.Statuses);
        var status = context.Statuses.FirstOrDefault(row => row.Id == statusId);
        var completedAt = ReadCompletion(status);

        if (statusId is null && completedAt is not null)
        {
            statusId = StatusLevel.FirstDone(context.Statuses);
        }

        return (statusId, completedAt);
    }

    private DateTime? ReadCompletion(StatusLevel? status)
    {
        var completed = ReadYesNo(CsvColumns.Completed, Cell(CsvColumns.Completed).Trim());
        var completedAt = ReadCompletedAt();

        if (completed == false && completedAt is not null)
        {
            Fail(CsvColumns.CompletedAt, "A completion time is set but Completed says no.");
        }

        CheckStatusAgrees(status, completed, completedAt);

        if ((completed == true || status?.Kind == StatusKind.Done) && completedAt is null)
        {
            return clock.GetUtcNow().UtcDateTime;
        }

        return completedAt;
    }

    private void CheckStatusAgrees(StatusLevel? status, bool? completed, DateTime? completedAt)
    {
        var doneButOpen = status?.Kind == StatusKind.Done && completed == false;
        var openButCompleted = status?.Kind == StatusKind.Open && (completed == true || completedAt is not null);

        if (doneButOpen || openButCompleted)
        {
            Fail(CsvColumns.Status, "Status must agree with completion.");
        }
    }

    private DateTime? ReadCompletedAt()
    {
        var text = Cell(CsvColumns.CompletedAt).Trim();

        if (text.Length == 0)
        {
            return null;
        }

        if (TransferTimeFormat.TryParseUtc(text, out var value))
        {
            return value;
        }

        Fail(CsvColumns.CompletedAt, "Expected a UTC timestamp such as 2026-11-13T12:00:00Z.");
        return null;
    }

    private bool? ReadYesNo(string column, string text)
    {
        if (text.Length == 0)
        {
            return null;
        }

        if (TryParseYesNo(text, out var value))
        {
            return value;
        }

        Fail(column, "Expected yes or no.");
        return null;
    }

    private static bool TryParseYesNo(string text, out bool value)
    {
        var yes = new[] { "yes", "y", "true", "1" };
        var no = new[] { "no", "n", "false", "0" };
        value = yes.Contains(text, StringComparer.OrdinalIgnoreCase);

        return value || no.Contains(text, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>Reads the Links cell: addresses separated by whitespace, each checked like an editor link.</summary>
    private List<string> ReadLinks()
    {
        var cell = Cell(CsvColumns.Links);
        var addresses = new List<Range>();

        if (!TryReadLinkRanges(cell, addresses))
        {
            Fail(CsvColumns.Links, $"An item may have at most {LinkPolicy.MaxLinksPerItem} links.");
            return [];
        }

        var urls = addresses.Select(address => cell[address]).ToList();
        ValidateLinks(urls);
        return urls;
    }

    private void ValidateLinks(List<string> urls)
    {
        foreach (var url in urls)
        {
            var problem = LinkPolicy.Validate(url, null);

            if (problem is null)
            {
                continue;
            }

            if (header.HasCustomLinksField)
            {
                Fail(CsvColumns.Links, "The Links column is ambiguous. It expects link addresses. "
                    + "If this column holds values for the custom field, rename the header to 'Links (field)'.");
                return;
            }

            Fail(CsvColumns.Links, $"'{url}': {problem}");
        }
    }

    private static bool TryReadLinkRanges(string cell, List<Range> addresses)
    {
        var position = 0;

        while (position < cell.Length)
        {
            if (char.IsWhiteSpace(cell[position]))
            {
                position++;
                continue;
            }

            if (addresses.Count == LinkPolicy.MaxLinksPerItem)
            {
                return false;
            }

            var start = position++;
            while (position < cell.Length && !char.IsWhiteSpace(cell[position]))
            {
                position++;
            }

            addresses.Add(start..position);
        }

        return true;
    }

    private List<FieldValueInput> ReadFieldValues()
    {
        var values = new List<FieldValueInput>();

        foreach (var (index, field) in header.FieldColumns)
        {
            var text = index < record.Cells.Count ? CsvCells.Unprotect(record.Cells[index]).Trim() : string.Empty;
            var value = text.Length == 0 ? null : ReadFieldValue(field, text);

            if (value is not null)
            {
                values.Add(value);
            }
        }

        return values;
    }

    private FieldValueInput? ReadFieldValue(FieldDefinition field, string text)
    {
        return field.DataType switch
        {
            FieldDataType.Text => new FieldValueInput(field.Id, TextValue: text),
            FieldDataType.Number => ReadNumber(field, text),
            FieldDataType.Date => ReadDateValue(field, text),
            FieldDataType.Boolean => ReadBoolean(field, text),
            _ => ReadChoice(field, text)
        };
    }

    private FieldValueInput? ReadNumber(FieldDefinition field, string text)
    {
        if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) && double.IsFinite(number))
        {
            return new FieldValueInput(field.Id, NumberValue: number);
        }

        Fail(CsvColumns.FieldHeader(field.DisplayName), $"'{text}' is not a number; use a dot for decimals, for example 2.5.");
        return null;
    }

    private FieldValueInput? ReadDateValue(FieldDefinition field, string text)
    {
        if (TransferTimeFormat.TryParseDate(text, out var date))
        {
            return new FieldValueInput(field.Id, DateValue: date);
        }

        Fail(CsvColumns.FieldHeader(field.DisplayName), "Expected a date such as 2026-11-13.");
        return null;
    }

    private FieldValueInput? ReadBoolean(FieldDefinition field, string text)
    {
        if (TryParseYesNo(text, out var value))
        {
            return new FieldValueInput(field.Id, BoolValue: value);
        }

        Fail(CsvColumns.FieldHeader(field.DisplayName), "Expected yes or no.");
        return null;
    }

    private FieldValueInput? ReadChoice(FieldDefinition field, string text)
    {
        var choices = context.ActiveChoicesOf(field.Id);
        var match = choices.FirstOrDefault(choice => string.Equals(choice.Label, text, StringComparison.OrdinalIgnoreCase));

        if (match is not null)
        {
            return new FieldValueInput(field.Id, ChoiceId: match.Id);
        }

        Fail(CsvColumns.FieldHeader(field.DisplayName), $"'{text}' is not one of the choices: {string.Join(", ", choices.Select(choice => choice.Label))}.");
        return null;
    }
}