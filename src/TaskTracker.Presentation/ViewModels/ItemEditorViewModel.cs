using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>An editable item draft saved explicitly by the workspace.</summary>
public sealed class ItemEditorViewModel : ViewModelBase
{
    private string title;
    private string? description;
    private string? ticketNumber;
    private Guid? itemTypeId;
    private Guid? priorityLevelId;
    private DateOnly? dueDate;
    private TimeOnly? dueTime;
    private DateTime? scheduledStart;
    private DateTime? scheduledEnd;
    private string dueDateText;
    private string dueTimeText;
    private string scheduledStartText;
    private string scheduledEndText;
    private ItemType? selectedType;
    private PriorityLevel? selectedPriority;
    private LookupOption<ItemType>? selectedTypeOption;
    private LookupOption<PriorityLevel>? selectedPriorityOption;
    private string? archivedTypeName;
    private string? archivedPriorityName;
    private bool preserveArchivedType = true;
    private bool preserveArchivedPriority = true;

    public ItemEditorViewModel(TodoItem item)
    {
        Id = item.Id;
        title = item.Title;
        description = item.Description;
        ticketNumber = item.TicketNumber;
        itemTypeId = item.ItemTypeId;
        priorityLevelId = item.PriorityLevelId;
        dueDate = item.DueDate;
        dueTime = item.DueTime;
        scheduledStart = item.ScheduledStart;
        scheduledEnd = item.ScheduledEnd;
        dueDateText = dueDate?.ToString("yyyy-MM-dd") ?? string.Empty;
        dueTimeText = dueTime?.ToString("HH:mm") ?? string.Empty;
        scheduledStartText = scheduledStart?.ToString("yyyy-MM-dd HH:mm") ?? string.Empty;
        scheduledEndText = scheduledEnd?.ToString("yyyy-MM-dd HH:mm") ?? string.Empty;
        ClearTypeCommand = new RelayCommand(ClearType);
        ClearPriorityCommand = new RelayCommand(ClearPriority);
        ClearDueDateCommand = new RelayCommand(() => DueDateText = string.Empty);
        ClearDueTimeCommand = new RelayCommand(() => DueTimeText = string.Empty);
        ClearStartCommand = new RelayCommand(() => ScheduledStartText = string.Empty);
        ClearEndCommand = new RelayCommand(() => ScheduledEndText = string.Empty);
    }

    public Guid Id { get; }

    public string Title
    {
        get => title;
        set => SetProperty(ref title, value);
    }

    public string? Description
    {
        get => description;
        set => SetProperty(ref description, value);
    }

    public string? TicketNumber
    {
        get => ticketNumber;
        set => SetProperty(ref ticketNumber, value);
    }

    public Guid? ItemTypeId
    {
        get => itemTypeId;
        set => SetProperty(ref itemTypeId, value);
    }

    public Guid? PriorityLevelId
    {
        get => priorityLevelId;
        set => SetProperty(ref priorityLevelId, value);
    }

    public DateOnly? DueDate
    {
        get => dueDate;
        set => SetProperty(ref dueDate, value);
    }

    public TimeOnly? DueTime
    {
        get => dueTime;
        set => SetProperty(ref dueTime, value);
    }

    public DateTime? ScheduledStart
    {
        get => scheduledStart;
        set => SetProperty(ref scheduledStart, value);
    }

    public DateTime? ScheduledEnd
    {
        get => scheduledEnd;
        set => SetProperty(ref scheduledEnd, value);
    }

    public string DueDateText
    {
        get => dueDateText;
        set
        {
            if (SetProperty(ref dueDateText, value))
            {
                OnPropertyChanged(nameof(DueDatePickerDate));
            }
        }
    }

    public string DueTimeText
    {
        get => dueTimeText;
        set
        {
            if (SetProperty(ref dueTimeText, value))
            {
                OnPropertyChanged(nameof(DueTimePickerTime));
            }
        }
    }

    public string ScheduledStartText
    {
        get => scheduledStartText;
        set
        {
            if (SetProperty(ref scheduledStartText, value))
            {
                OnPropertyChanged(nameof(StartPickerDate));
                OnPropertyChanged(nameof(StartPickerTime));
            }
        }
    }

    public string ScheduledEndText
    {
        get => scheduledEndText;
        set
        {
            if (SetProperty(ref scheduledEndText, value))
            {
                OnPropertyChanged(nameof(EndPickerDate));
                OnPropertyChanged(nameof(EndPickerTime));
            }
        }
    }

    public DateTime? DueDatePickerDate
    {
        get => PickerDate(DueDateText);
        set => DueDateText = value?.ToString("yyyy-MM-dd") ?? string.Empty;
    }

    public TimeSpan? DueTimePickerTime
    {
        get => PickerTime(DueTimeText);
        set => DueTimeText = value?.ToString(@"hh\:mm") ?? string.Empty;
    }

    public DateTime? StartPickerDate
    {
        get => PickerDate(ScheduledStartText);
        set => ScheduledStartText = CombinePicker(value, StartPickerTime);
    }

    public TimeSpan? StartPickerTime
    {
        get => PickerTime(ScheduledStartText);
        set => ScheduledStartText = CombinePicker(StartPickerDate, value);
    }

    public DateTime? EndPickerDate
    {
        get => PickerDate(ScheduledEndText);
        set => ScheduledEndText = CombinePicker(value, EndPickerTime);
    }

    public TimeSpan? EndPickerTime
    {
        get => PickerTime(ScheduledEndText);
        set => ScheduledEndText = CombinePicker(EndPickerDate, value);
    }

    public ItemType? SelectedType
    {
        get => selectedType;
        set
        {
            if (SetProperty(ref selectedType, value))
            {
                OnPropertyChanged(nameof(SelectedTypeOption));
            }
        }
    }

    public PriorityLevel? SelectedPriority
    {
        get => selectedPriority;
        set
        {
            if (SetProperty(ref selectedPriority, value))
            {
                OnPropertyChanged(nameof(SelectedPriorityOption));
            }
        }
    }

    public LookupOption<ItemType> SelectedTypeOption
    {
        get => selectedTypeOption ?? new(SelectedType?.Name ?? "None", SelectedType);
        set
        {
            if (ReferenceEquals(selectedTypeOption, value))
            {
                return;
            }

            selectedTypeOption = value;
            preserveArchivedType = false;
            SelectedType = value?.Value;
            OnPropertyChanged();
        }
    }

    public LookupOption<PriorityLevel> SelectedPriorityOption
    {
        get => selectedPriorityOption ?? new(SelectedPriority?.Name ?? "None", SelectedPriority);
        set
        {
            if (ReferenceEquals(selectedPriorityOption, value))
            {
                return;
            }

            selectedPriorityOption = value;
            preserveArchivedPriority = false;
            SelectedPriority = value?.Value;
            OnPropertyChanged();
        }
    }

    /// <summary>Matches the draft's stored lookup IDs to the picker collection instances.</summary>
    public void InitializeOptions(IReadOnlyList<LookupOption<ItemType>> types,
        IReadOnlyList<LookupOption<PriorityLevel>> priorities)
    {
        selectedTypeOption = types.FirstOrDefault(option => option.Value?.Id == SelectedType?.Id);
        selectedPriorityOption = priorities.FirstOrDefault(option => option.Value?.Id == SelectedPriority?.Id);
        OnPropertyChanged(nameof(SelectedTypeOption));
        OnPropertyChanged(nameof(SelectedPriorityOption));
    }

    public string? ArchivedTypeName
    {
        get => archivedTypeName;
        set => SetProperty(ref archivedTypeName, value);
    }

    public string? ArchivedPriorityName
    {
        get => archivedPriorityName;
        set => SetProperty(ref archivedPriorityName, value);
    }

    public bool HasArchivedType => ArchivedTypeName is not null;

    public bool HasArchivedPriority => ArchivedPriorityName is not null;

    public ICommand ClearTypeCommand { get; }

    public ICommand ClearPriorityCommand { get; }

    public ICommand ClearDueDateCommand { get; }

    public ICommand ClearDueTimeCommand { get; }

    public ICommand ClearStartCommand { get; }

    public ICommand ClearEndCommand { get; }

    /// <summary>Parses the draft and retains archived lookup IDs until explicitly replaced.</summary>
    public ItemEdit ToEdit()
    {
        var date = ParseDate(DueDateText);
        var time = ParseTime(DueTimeText);
        var start = ParseDateTime(ScheduledStartText);
        var end = ParseDateTime(ScheduledEndText);
        var typeId = HasArchivedType && preserveArchivedType && SelectedType is null ? ItemTypeId : SelectedType?.Id;
        var priorityId = HasArchivedPriority && preserveArchivedPriority && SelectedPriority is null
            ? PriorityLevelId
            : SelectedPriority?.Id;
        return new ItemEdit(Title, Description, TicketNumber, typeId, priorityId,
            date, time, start, end);
    }

    /// <summary>Compares the parsed draft with the persisted item.</summary>
    public bool IsDirty(TodoItem item)
    {
        return ToEdit() != new ItemEdit(item.Title, item.Description, item.TicketNumber,
            item.ItemTypeId, item.PriorityLevelId, item.DueDate, item.DueTime,
            item.ScheduledStart, item.ScheduledEnd);
    }

    private static DateOnly? ParseDate(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        if (!DateOnly.TryParseExact(text, "yyyy-MM-dd", out var value))
        {
            throw new DomainRuleException("Due date must use yyyy-MM-dd.");
        }

        return value;
    }

    private static DateTime? PickerDate(string text)
    {
        if (!DateOnly.TryParseExact(text.Split(' ')[0], "yyyy-MM-dd", out var date))
        {
            return null;
        }

        return date.ToDateTime(TimeOnly.MinValue);
    }

    private static TimeSpan? PickerTime(string text)
    {
        var part = text.Contains(' ') ? text.Split(' ')[1] : text;
        return TimeOnly.TryParseExact(part, "HH:mm", out var time) ? time.ToTimeSpan() : null;
    }

    private static string CombinePicker(DateTime? date, TimeSpan? time)
    {
        if (date is null)
        {
            return string.Empty;
        }

        return $"{date.Value:yyyy-MM-dd} {(time ?? TimeSpan.Zero).ToString(@"hh\:mm")}";
    }

    private void ClearType()
    {
        preserveArchivedType = false;
        selectedTypeOption = null;
        SelectedType = null;
    }

    private void ClearPriority()
    {
        preserveArchivedPriority = false;
        selectedPriorityOption = null;
        SelectedPriority = null;
    }

    private static TimeOnly? ParseTime(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        if (!TimeOnly.TryParseExact(text, "HH:mm", out var value))
        {
            throw new DomainRuleException("Due time must use HH:mm.");
        }

        return value;
    }

    private static DateTime? ParseDateTime(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        if (!DateTime.TryParseExact(text, "yyyy-MM-dd HH:mm", null,
            System.Globalization.DateTimeStyles.None, out var value))
        {
            throw new DomainRuleException("Scheduled times must use yyyy-MM-dd HH:mm.");
        }

        return value;
    }
}