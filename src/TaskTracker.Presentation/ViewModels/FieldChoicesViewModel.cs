using System.Collections.ObjectModel;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// The expandable choices panel of one choice field. Every operation saves immediately and
/// reloads only this panel, so text typed into other fields' boxes is never disturbed.
/// </summary>
public sealed class FieldChoicesViewModel : ViewModelBase
{
    private readonly FieldService fields;
    private readonly IDialogService dialogs;
    private readonly Guid fieldId;
    private readonly bool showArchived;
    private bool isExpanded;
    private string newLabel = string.Empty;

    public FieldChoicesViewModel(FieldService fields, IDialogService dialogs,
        FieldDefinition field, bool showArchived)
    {
        this.fields = fields;
        this.dialogs = dialogs;
        this.showArchived = showArchived;
        fieldId = field.Id;
        CanAdd = !field.IsArchived;
        AddCommand = new AsyncRelayCommand(AddAsync);
        RenameCommand = new AsyncRelayCommand<FieldChoiceRowViewModel>(RenameAsync);
        MoveUpCommand = new AsyncRelayCommand<FieldChoiceRowViewModel>(row => MoveAsync(row, -1), CanMoveUp);
        MoveDownCommand = new AsyncRelayCommand<FieldChoiceRowViewModel>(row => MoveAsync(row, 1), CanMoveDown);
        ArchiveCommand = new AsyncRelayCommand<FieldChoiceRowViewModel>(ArchiveAsync);
        UnarchiveCommand = new AsyncRelayCommand<FieldChoiceRowViewModel>(UnarchiveAsync);
    }

    /// <summary>The choices shown, in order; archived ones only when the manager shows archived items.</summary>
    public ObservableCollection<FieldChoiceRowViewModel> Rows { get; } = [];

    /// <summary>Archived fields cannot receive new choices.</summary>
    public bool CanAdd { get; }

    public bool IsExpanded
    {
        get => isExpanded;
        set => SetProperty(ref isExpanded, value);
    }

    /// <summary>The unsaved text of the "new choice" box.</summary>
    public string NewLabel
    {
        get => newLabel;
        set => SetProperty(ref newLabel, value);
    }

    /// <summary>The panel title with the number of active choices.</summary>
    public string Header
    {
        get { return $"Choices ({Rows.Count(row => !row.IsArchived)})"; }
    }

    public IAsyncRelayCommand AddCommand { get; }

    public IAsyncRelayCommand<FieldChoiceRowViewModel> RenameCommand { get; }

    public IAsyncRelayCommand<FieldChoiceRowViewModel> MoveUpCommand { get; }

    public IAsyncRelayCommand<FieldChoiceRowViewModel> MoveDownCommand { get; }

    public IAsyncRelayCommand<FieldChoiceRowViewModel> ArchiveCommand { get; }

    public IAsyncRelayCommand<FieldChoiceRowViewModel> UnarchiveCommand { get; }

    /// <summary>Reloads this field's choices from the database.</summary>
    public async Task LoadAsync()
    {
        var choices = await fields.ListChoicesAsync(fieldId);
        var ordered = choices.OrderBy(choice => choice.SortOrder).ToList();
        var active = ordered.Where(choice => !choice.IsArchived).ToList();
        var shown = ordered.Where(choice => showArchived || !choice.IsArchived).ToList();

        Rows.Clear();

        foreach (var choice in shown)
        {
            var position = active.IndexOf(choice);
            var canMoveDown = position >= 0 && position < active.Count - 1;
            Rows.Add(new FieldChoiceRowViewModel(choice, position > 0, canMoveDown));
        }

        OnPropertyChanged(nameof(Header));
    }

    private static bool CanMoveUp(FieldChoiceRowViewModel? row)
    {
        return row?.CanMoveUp == true;
    }

    private static bool CanMoveDown(FieldChoiceRowViewModel? row)
    {
        return row?.CanMoveDown == true;
    }

    private async Task AddAsync()
    {
        var label = NewLabel;
        var added = await RunAsync(() => fields.AddChoiceAsync(fieldId, label));

        if (added)
        {
            NewLabel = string.Empty;
        }
    }

    private async Task RenameAsync(FieldChoiceRowViewModel? row)
    {
        if (row is null)
        {
            return;
        }

        var label = await dialogs.PromptAsync("Rename choice", "Label", row.Label);

        if (label is not null)
        {
            await RunAsync(() => fields.RenameChoiceAsync(fieldId, row.Id, label));
        }
    }

    private async Task MoveAsync(FieldChoiceRowViewModel? row, int offset)
    {
        if (row is null)
        {
            return;
        }

        var activeIds = Rows.Where(choice => !choice.IsArchived).Select(choice => choice.Id).ToList();
        var saved = await fields.ListChoicesAsync(fieldId);
        var savedIds = saved.OrderBy(choice => choice.SortOrder).Select(choice => choice.Id).ToList();
        var reordered = ReorderPlan.SwapWithActiveNeighbour(savedIds, activeIds, row.Id, offset);

        await RunAsync(() => fields.ReorderChoicesAsync(fieldId, reordered));
    }

    private async Task ArchiveAsync(FieldChoiceRowViewModel? row)
    {
        if (row is not null)
        {
            await RunAsync(() => fields.ArchiveChoiceAsync(fieldId, row.Id));
        }
    }

    private async Task UnarchiveAsync(FieldChoiceRowViewModel? row)
    {
        if (row is not null)
        {
            await RunAsync(() => fields.UnarchiveChoiceAsync(fieldId, row.Id));
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