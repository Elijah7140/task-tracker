using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Items;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Displays one open ticket and exposes its row actions.</summary>
public sealed class TicketRowViewModel
{
    internal TicketRowViewModel(TodoItem item, string project, TicketsViewModel page, RowLookupMenus menus)
    {
        Id = item.Id;
        PriorityId = item.PriorityLevelId;
        Number = item.TicketNumber!;
        Title = item.Title;
        Project = project;
        Status = menus.StatusName(item.StatusId);
        Due = item.DueDate;
        var hasDates = item.DueDate.HasValue || item.ScheduledStart.HasValue;
        PushBackReason = PushBackOneDay.UnavailableReason(isCompleted: false, hasDates);
        OpenCommand = new AsyncRelayCommand(() => page.OpenAsync(Id));
        PushBackCommand = new AsyncRelayCommand(() => page.PushBackAsync(Id), () => PushBackReason is null);
        StatusChoices = menus.Statuses(item.StatusId, status => page.SetStatusAsync(Id, status));
        PriorityChoices = menus.Priorities(PriorityId, priority => page.SetPriorityAsync(Id, priority));
    }

    public Guid Id { get; }

    public Guid? PriorityId { get; }

    public string Number { get; }

    public string Title { get; }

    public string Project { get; }

    public string? Status { get; }

    public DateOnly? Due { get; }

    public string? PushBackReason { get; }

    public ICommand OpenCommand { get; }

    public ICommand PushBackCommand { get; }

    public IReadOnlyList<RowLookupChoice> StatusChoices { get; }

    public IReadOnlyList<RowLookupChoice> PriorityChoices { get; }
}