using System.Collections.ObjectModel;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Lookups;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Manages either editable lookup list with the same commands and view. Every operation
/// saves immediately through <see cref="LookupService"/>.
/// </summary>
public sealed class LookupListViewModel : ViewModelBase
{
    private readonly LookupService lookups;
    private readonly IDialogService dialogs;
    private readonly bool itemTypes;
    private string newName = string.Empty;

    public LookupListViewModel(LookupService lookups, IDialogService dialogs, bool itemTypes)
    {
        this.lookups = lookups;
        this.dialogs = dialogs;
        this.itemTypes = itemTypes;
        Title = itemTypes ? "Item types" : "Priority levels";
        AddCommand = new AsyncRelayCommand(AddAsync);
        RenameCommand = new AsyncRelayCommand<LookupRowViewModel>(RenameAsync);
        MoveUpCommand = new AsyncRelayCommand<LookupRowViewModel>(row => MoveAsync(row, -1), row => row?.CanMoveUp == true);
        MoveDownCommand = new AsyncRelayCommand<LookupRowViewModel>(row => MoveAsync(row, 1), row => row?.CanMoveDown == true);
        ArchiveCommand = new AsyncRelayCommand<LookupRowViewModel>(ArchiveAsync, row => row?.CanArchive == true);
        UnarchiveCommand = new AsyncRelayCommand<LookupRowViewModel>(UnarchiveAsync);
    }

    public string Title { get; }

    public bool IsPriority => !itemTypes;

    public ObservableCollection<LookupRowViewModel> Active { get; } = [];

    public ObservableCollection<LookupRowViewModel> Archived { get; } = [];

    public bool HasArchived => Archived.Count > 0;

    /// <summary>The text of the add row's name box.</summary>
    public string NewName
    {
        get => newName;
        set => SetProperty(ref newName, value);
    }

    public IAsyncRelayCommand AddCommand { get; }

    public IAsyncRelayCommand<LookupRowViewModel> RenameCommand { get; }

    public IAsyncRelayCommand<LookupRowViewModel> MoveUpCommand { get; }

    public IAsyncRelayCommand<LookupRowViewModel> MoveDownCommand { get; }

    public IAsyncRelayCommand<LookupRowViewModel> ArchiveCommand { get; }

    public IAsyncRelayCommand<LookupRowViewModel> UnarchiveCommand { get; }

    public async Task LoadAsync()
    {
        var rows = await LoadRowsAsync();
        var activeRows = rows.Where(row => !row.IsArchived).ToList();
        Active.Clear();
        Archived.Clear();

        for (var index = 0; index < activeRows.Count; index++)
        {
            Active.Add(new LookupRowViewModel(activeRows[index], itemTypes, index > 0, index < activeRows.Count - 1));
        }

        foreach (var row in rows.Where(row => row.IsArchived))
        {
            Archived.Add(new LookupRowViewModel(row, itemTypes, false, false));
        }

        OnPropertyChanged(nameof(HasArchived));
    }

    private async Task<List<LookupEntity>> LoadRowsAsync()
    {
        var rows = itemTypes
            ? (await lookups.ItemTypesAsync()).Cast<LookupEntity>()
            : (await lookups.PriorityLevelsAsync()).Cast<LookupEntity>();

        return rows.OrderBy(row => row.SortOrder).ToList();
    }

    private async Task AddAsync()
    {
        var added = await RunAsync(() => itemTypes ? lookups.AddItemTypeAsync(NewName) : lookups.AddPriorityLevelAsync(NewName));

        if (added)
        {
            NewName = string.Empty;
        }
    }

    private async Task RenameAsync(LookupRowViewModel? row)
    {
        if (row is null)
        {
            return;
        }

        var name = await dialogs.PromptAsync($"Rename {Singular}", "Name", row.Name);

        if (name is not null)
        {
            await RunAsync(() => itemTypes
                ? lookups.RenameItemTypeAsync(row.Id, name)
                : lookups.RenamePriorityLevelAsync(row.Id, name));
        }
    }

    private async Task MoveAsync(LookupRowViewModel? row, int offset)
    {
        var index = row is null ? -1 : Active.IndexOf(row);
        var neighbourIndex = index + offset;

        if (index < 0 || neighbourIndex < 0 || neighbourIndex >= Active.Count)
        {
            return;
        }

        var ids = (await LoadRowsAsync()).Select(entity => entity.Id).ToList();
        var first = ids.IndexOf(Active[index].Id);
        var second = ids.IndexOf(Active[neighbourIndex].Id);
        (ids[first], ids[second]) = (ids[second], ids[first]);

        await RunAsync(() => itemTypes
            ? lookups.ReorderItemTypesAsync(ids)
            : lookups.ReorderPriorityLevelsAsync(ids));
    }

    private async Task ArchiveAsync(LookupRowViewModel? row)
    {
        if (row is not null)
        {
            await RunAsync(() => itemTypes
                ? lookups.ArchiveItemTypeAsync(row.Id)
                : lookups.ArchivePriorityLevelAsync(row.Id));
        }
    }

    private async Task UnarchiveAsync(LookupRowViewModel? row)
    {
        if (row is not null)
        {
            await RunAsync(() => itemTypes
                ? lookups.UnarchiveItemTypeAsync(row.Id)
                : lookups.UnarchivePriorityLevelAsync(row.Id));
        }
    }

    private string Singular => itemTypes ? "item type" : "priority level";

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
            await dialogs.ShowMessageAsync("Lookup validation", exception.Message);

            return false;
        }
    }
}