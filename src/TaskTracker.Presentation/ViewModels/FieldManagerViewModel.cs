using System.Collections.ObjectModel;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Manages the custom fields of one scope: the global fields (no project) or one project's
/// own fields. A project's manager also lists the inherited global fields read-only.
/// Every operation saves immediately through <see cref="FieldService"/>.
/// </summary>
public sealed class FieldManagerViewModel : ViewModelBase
{
    private readonly FieldService fields;
    private readonly IDialogService dialogs;
    private readonly Guid? projectId;
    private readonly HashSet<Guid> openChoicePanelIds = [];
    private string newName = string.Empty;
    private FieldDataType newType = FieldDataType.Text;
    private bool showArchived;

    public FieldManagerViewModel(FieldService fields, IDialogService dialogs, Guid? projectId)
    {
        this.fields = fields;
        this.dialogs = dialogs;
        this.projectId = projectId;
        Title = projectId is null ? "Custom fields" : "Project custom fields";
        Description = projectId is null
            ? "Available in every project. Changes save immediately."
            : "Only used in this project. Changes save immediately.";
        AddCommand = new AsyncRelayCommand(AddAsync);
        SetShowArchivedCommand = new AsyncRelayCommand<bool?>(show => SetShowArchivedAsync(show == true));
        RenameCommand = new AsyncRelayCommand<FieldRowViewModel>(RenameAsync);
        ChangeTypeCommand = new AsyncRelayCommand<FieldRowViewModel>(
            ChangeTypeAsync, AsyncRelayCommandOptions.AllowConcurrentExecutions);
        MoveUpCommand = new AsyncRelayCommand<FieldRowViewModel>(row => MoveAsync(row, -1), CanMoveUp);
        MoveDownCommand = new AsyncRelayCommand<FieldRowViewModel>(row => MoveAsync(row, 1), CanMoveDown);
        ArchiveCommand = new AsyncRelayCommand<FieldRowViewModel>(ArchiveAsync);
        UnarchiveCommand = new AsyncRelayCommand<FieldRowViewModel>(UnarchiveAsync);
    }

    public string Title { get; }

    public string Description { get; }

    public IReadOnlyList<FieldDataType> Types { get; } = Enum.GetValues<FieldDataType>();

    /// <summary>The fields of this scope, in order; archived ones only while <see cref="ShowArchived"/> is on.</summary>
    public ObservableCollection<FieldRowViewModel> Rows { get; } = [];

    /// <summary>The active global fields a project inherits; always empty for the global manager.</summary>
    public ObservableCollection<InheritedFieldRowViewModel> Inherited { get; } = [];

    public bool HasInherited
    {
        get { return projectId is not null; }
    }

    /// <summary>The text of the add row's name box.</summary>
    public string NewName
    {
        get => newName;
        set => SetProperty(ref newName, value);
    }

    /// <summary>The data type chosen in the add row. It is kept after adding, so several fields of one type are quick to add.</summary>
    public FieldDataType NewType
    {
        get => newType;
        set => SetProperty(ref newType, value);
    }

    /// <summary>Whether archived fields and choices are listed. Change it with <see cref="SetShowArchivedCommand"/>.</summary>
    public bool ShowArchived
    {
        get => showArchived;
        private set => SetProperty(ref showArchived, value);
    }

    public IAsyncRelayCommand AddCommand { get; }

    /// <summary>Sets <see cref="ShowArchived"/> to the given value and reloads the lists.</summary>
    public IAsyncRelayCommand<bool?> SetShowArchivedCommand { get; }

    public IAsyncRelayCommand<FieldRowViewModel> RenameCommand { get; }

    /// <summary>Saves the type currently selected in the given row; the row shows the saved type afterwards.</summary>
    public IAsyncRelayCommand<FieldRowViewModel> ChangeTypeCommand { get; }

    /// <summary>
    /// Swaps the field with the active field above it and saves the order at once. Archived fields keep
    /// their places in the saved order.
    /// </summary>
    public IAsyncRelayCommand<FieldRowViewModel> MoveUpCommand { get; }

    /// <summary>Swaps the field with the active field below it; see <see cref="MoveUpCommand"/>.</summary>
    public IAsyncRelayCommand<FieldRowViewModel> MoveDownCommand { get; }

    public IAsyncRelayCommand<FieldRowViewModel> ArchiveCommand { get; }

    public IAsyncRelayCommand<FieldRowViewModel> UnarchiveCommand { get; }

    /// <summary>Reloads the rows and the inherited list from the database; open choice panels stay open.</summary>
    public async Task LoadAsync()
    {
        RememberOpenChoicePanels();
        var definitions = await fields.ListAllAsync(projectId);
        var ordered = definitions.OrderBy(field => field.SortOrder).ToList();
        var own = ordered.Where(field => field.ProjectId == projectId).ToList();
        var rows = await BuildRowsAsync(own);
        var inherited = InheritedFields(ordered);

        Rows.Clear();
        Inherited.Clear();

        foreach (var row in rows)
        {
            Rows.Add(row);
        }

        foreach (var field in inherited)
        {
            Inherited.Add(new InheritedFieldRowViewModel(field));
        }
    }

    private static bool CanMoveUp(FieldRowViewModel? row)
    {
        return row?.CanMoveUp == true;
    }

    private static bool CanMoveDown(FieldRowViewModel? row)
    {
        return row?.CanMoveDown == true;
    }

    /// <summary>
    /// Records which choice panels the user has open. Rows without a panel are left alone, so
    /// a request to open the panel of a field that just became a choice field is not lost.
    /// </summary>
    private void RememberOpenChoicePanels()
    {
        foreach (var row in Rows.Where(row => row.Choices is not null))
        {
            if (row.Choices!.IsExpanded)
            {
                openChoicePanelIds.Add(row.Id);
            }
            else
            {
                openChoicePanelIds.Remove(row.Id);
            }
        }
    }

    private async Task<List<FieldRowViewModel>> BuildRowsAsync(List<FieldDefinition> own)
    {
        var active = own.Where(field => !field.IsArchived).ToList();
        var shown = own.Where(field => ShowArchived || !field.IsArchived);
        var rows = new List<FieldRowViewModel>();

        foreach (var definition in shown)
        {
            rows.Add(await BuildRowAsync(definition, active));
        }

        return rows;
    }

    private async Task<FieldRowViewModel> BuildRowAsync(FieldDefinition definition, List<FieldDefinition> active)
    {
        var position = active.IndexOf(definition);
        var canMoveDown = position >= 0 && position < active.Count - 1;
        var choices = definition.DataType == FieldDataType.Choice ? await BuildChoicesAsync(definition) : null;

        return new FieldRowViewModel(definition, position > 0, canMoveDown, choices, RequestTypeChange);
    }

    private async Task<FieldChoicesViewModel> BuildChoicesAsync(FieldDefinition definition)
    {
        var choices = new FieldChoicesViewModel(fields, dialogs, definition, ShowArchived);
        choices.IsExpanded = openChoicePanelIds.Contains(definition.Id);
        await choices.LoadAsync();

        return choices;
    }

    private IEnumerable<FieldDefinition> InheritedFields(List<FieldDefinition> definitions)
    {
        if (projectId is null)
        {
            return [];
        }

        return definitions.Where(field => field.ProjectId is null && !field.IsArchived);
    }

    private void RequestTypeChange(FieldRowViewModel row)
    {
        ChangeTypeCommand.Execute(row);
    }

    private async Task SetShowArchivedAsync(bool show)
    {
        ShowArchived = show;
        await LoadAsync();
    }

    private async Task AddAsync()
    {
        var added = await RunAsync(CreateFieldAsync);

        if (added)
        {
            NewName = string.Empty;
        }
    }

    private async Task CreateFieldAsync()
    {
        var field = await fields.CreateAsync(NewName, NewType, projectId);

        if (field.DataType == FieldDataType.Choice)
        {
            openChoicePanelIds.Add(field.Id);
        }
    }

    private async Task RenameAsync(FieldRowViewModel? row)
    {
        if (row is null)
        {
            return;
        }

        var name = await dialogs.PromptAsync("Rename field", "Name", row.Name);

        if (name is not null)
        {
            await RunAsync(() => fields.RenameAsync(row.Id, name));
        }
    }

    /// <summary>
    /// Saves the row's selected type. Whatever happens, the rows are reloaded afterwards so the
    /// type list can never keep showing a type that was not saved.
    /// </summary>
    private async Task ChangeTypeAsync(FieldRowViewModel? row)
    {
        if (row is null)
        {
            return;
        }

        try
        {
            await ApplyTypeChangeAsync(row.Id, row.SelectedType);
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Field validation", exception.Message);
        }
        finally
        {
            await LoadAsync();
        }
    }

    private async Task ApplyTypeChangeAsync(Guid fieldId, FieldDataType type)
    {
        await fields.ChangeTypeAsync(fieldId, type);

        if (type == FieldDataType.Choice)
        {
            openChoicePanelIds.Add(fieldId);
        }
    }

    private async Task MoveAsync(FieldRowViewModel? row, int offset)
    {
        if (row is null)
        {
            return;
        }

        var activeIds = Rows.Where(field => !field.IsArchived).Select(field => field.Id).ToList();
        var definitions = await fields.ListAllAsync(projectId);
        var savedIds = definitions
            .Where(field => field.ProjectId == projectId)
            .OrderBy(field => field.SortOrder)
            .Select(field => field.Id)
            .ToList();
        var reordered = ReorderPlan.SwapWithActiveNeighbour(savedIds, activeIds, row.Id, offset);

        await RunAsync(() => fields.ReorderAsync(projectId, reordered));
    }

    private async Task ArchiveAsync(FieldRowViewModel? row)
    {
        if (row is not null)
        {
            await RunAsync(() => fields.ArchiveAsync(row.Id));
        }
    }

    private async Task UnarchiveAsync(FieldRowViewModel? row)
    {
        if (row is not null)
        {
            await RunAsync(() => fields.UnarchiveAsync(row.Id));
        }
    }

    /// <summary>Runs a service call and reloads on success; a refused change shows the service's message.</summary>
    private async Task<bool> RunAsync(Func<Task> action)
    {
        try
        {
            await action();
            await LoadAsync();

            return true;
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Field validation", exception.Message);

            return false;
        }
    }
}