using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Search;
using TaskTracker.Core.Tickets;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Loads Tickets, applies the project filter and maps row gestures to ticket positions.</summary>
public sealed class TicketsViewModel : ViewModelBase, IDisposable
{
    private static readonly TicketProjectOption All = new(null, "All projects");
    private readonly TicketService service;
    private readonly INavigationService navigation;
    private readonly DataSaved saves;
    private readonly IUiDispatcher dispatcher;
    private TicketProjectOption? selectedProject = All;
    private bool applyingProjects;
    private bool disposed;
    private bool writing;
    private int loadVersion;
    private long loadedRevision = -1;
    private string? error;

    public TicketsViewModel(TicketService service, INavigationService navigation, DataSaved saves,
        IUiDispatcher dispatcher)
    {
        this.service = service;
        this.navigation = navigation;
        this.saves = saves;
        this.dispatcher = dispatcher;
        BackCommand = new AsyncRelayCommand(navigation.ReturnFromTicketsAsync);
        saves.Committed += OnSaved;
    }

    public event Action<Task>? WriteStarted;

    /// <summary>Raised after a ticket moves and the board has refreshed.</summary>
    public event Action<Guid>? TicketMoved;

    public ICommand BackCommand { get; }

    public IReadOnlyList<TicketProjectOption> Projects { get; private set; } = [All];

    public IReadOnlyList<TicketSectionViewModel> Sections { get; private set; } = [];

    public TicketProjectOption? SelectedProject
    {
        get => selectedProject;
        set
        {
            if (SetProperty(ref selectedProject, value) && !applyingProjects)
            {
                Refresh();
            }
        }
    }

    public bool IsEmpty => Sections.All(section => section.Rows.Count == 0);

    public string? Error
    {
        get => error;
        private set => SetProperty(ref error, value);
    }

    public async Task LoadAsync()
    {
        if (disposed)
        {
            return;
        }

        var version = ++loadVersion;
        var revision = saves.Revision;
        var projectId = SelectedProject?.Id;
        try
        {
            var board = await service.LoadAsync(projectId);
            if (!disposed && version == loadVersion)
            {
                await ApplyLoadAsync(board, projectId, revision);
            }
        }
        catch (Exception exception)
        {
            if (!disposed && version == loadVersion)
            {
                Error = exception.Message;
            }
        }
    }

    private async Task ApplyLoadAsync(TicketBoard board, Guid? projectId, long revision)
    {
        UpdateProjects(board);
        if (projectId != SelectedProject?.Id)
        {
            await LoadAsync();
            return;
        }

        var menus = new RowLookupMenus(board.Statuses, board.Priorities);
        var names = board.Projects.ToDictionary(project => project.Id, project => project.Name);
        Sections = board.Sections.Select(section => new TicketSectionViewModel(section.Priority,
            section.Items.Select(item => new TicketRowViewModel(item, names[item.ProjectId], this, menus)).ToArray()))
            .ToArray();
        loadedRevision = revision;
        Error = null;
        OnPropertyChanged(nameof(Sections));
        OnPropertyChanged(nameof(IsEmpty));
    }

    private void UpdateProjects(TicketBoard board)
    {
        TicketProjectOption[] options = [All, .. board.Projects.Select(project => new TicketProjectOption(project.Id, project.Name))];
        if (Projects.SequenceEqual(options))
        {
            return;
        }

        var projectId = SelectedProject?.Id;
        applyingProjects = true;
        Projects = options;
        OnPropertyChanged(nameof(Projects));
        SelectedProject = options.FirstOrDefault(option => option.Id == projectId) ?? All;
        applyingProjects = false;
    }

    /// <summary>Checks whether a visible drop target accepts the dragged ticket.</summary>
    public bool CanDrop(TicketRowViewModel row, TicketPosition position)
    {
        return !disposed && !writing && row.Id != position.AnchorId &&
            (row.PriorityId == position.PriorityId ||
                Sections.Any(section => section.PriorityId == position.PriorityId && section.AcceptsNewTickets));
    }

    public Task MoveAsync(TicketRowViewModel row, TicketPosition position)
    {
        return CanDrop(row, position)
            ? StartWrite(row.Id, () => service.MoveAsync(row.Id, position))
            : Task.CompletedTask;
    }

    /// <summary>Moves across the nearest row or into the adjacent assignable empty section.</summary>
    public Task MoveOneAsync(TicketRowViewModel row, bool down)
    {
        var section = Sections.FirstOrDefault(section => section.PriorityId == row.PriorityId);
        if (section is null || !section.Rows.Contains(row))
        {
            return Task.CompletedTask;
        }

        var rows = down ? section.Rows : section.Rows.Reverse();
        var neighbor = rows.SkipWhile(candidate => candidate != row).Skip(1).FirstOrDefault();
        if (neighbor is not null)
        {
            return MoveAsync(row, new TicketPosition(section.PriorityId, neighbor.Id, After: down));
        }

        return MoveAcrossSectionsAsync(row, section, down);
    }

    private Task MoveAcrossSectionsAsync(TicketRowViewModel row, TicketSectionViewModel section, bool down)
    {
        var sections = down ? Sections : Sections.Reverse();
        var next = sections.SkipWhile(candidate => candidate != section).Skip(1)
            .FirstOrDefault(candidate => candidate.AcceptsNewTickets);
        if (next is null)
        {
            return Task.CompletedTask;
        }

        var anchor = down ? next.Rows.FirstOrDefault() : next.Rows.LastOrDefault();
        return MoveAsync(row, new TicketPosition(next.PriorityId, anchor?.Id, After: !down));
    }

    internal async Task OpenAsync(Guid id)
    {
        if (!disposed && !writing && await navigation.OpenTicketItemAsync(id) == SearchOpenOutcome.ItemMissing)
        {
            await LoadAsync();
            Error = "This item no longer exists.";
        }
    }

    internal Task SetPriorityAsync(Guid id, Guid? priorityId)
    {
        return StartWrite(id, () => service.SetPriorityAsync(id, priorityId));
    }

    internal Task SetStatusAsync(Guid id, Guid? statusId)
    {
        return disposed || writing ? Task.CompletedTask : navigation.SetRowStatusAsync(id, statusId);
    }

    internal Task PushBackAsync(Guid id)
    {
        return disposed || writing ? Task.CompletedTask : navigation.PushBackAsync(id);
    }

    private Task StartWrite(Guid id, Func<Task<bool>> save)
    {
        if (disposed || writing)
        {
            return Task.CompletedTask;
        }

        var write = SaveAsync(id, save);
        WriteStarted?.Invoke(write);
        return write;
    }

    private async Task SaveAsync(Guid id, Func<Task<bool>> save)
    {
        writing = true;
        try
        {
            var moved = await save();
            if (loadedRevision != saves.Revision)
            {
                await LoadAsync();
            }

            if (moved)
            {
                TicketMoved?.Invoke(id);
            }
        }
        catch (DomainRuleException exception)
        {
            await LoadAsync();
            Error = exception.Message;
        }
        catch (Exception exception)
        {
            if (loadedRevision != saves.Revision)
            {
                await LoadAsync();
            }

            Error = exception.Message;
        }
        finally
        {
            writing = false;
        }
    }

    private void OnSaved()
    {
        dispatcher.Post(RefreshAfterSave);
    }

    private void RefreshAfterSave()
    {
        if (!writing && loadedRevision != saves.Revision)
        {
            Refresh();
        }
    }

    private async void Refresh()
    {
        await LoadAsync();
    }

    public void Dispose()
    {
        disposed = true;
        saves.Committed -= OnSaved;
    }
}