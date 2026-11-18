using System.Collections.ObjectModel;
using System.Globalization;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Lookups;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Manages one editable lookup list (item types, priority levels or statuses) with the same
/// commands and view. Every operation saves immediately through <see cref="LookupService"/>.
/// </summary>
public sealed class LookupListViewModel : ViewModelBase
{
    private readonly LookupService lookups;
    private readonly IDialogService dialogs;
    private readonly LookupListKind kind;
    private string newNumber = string.Empty;
    private string newName = string.Empty;

    public LookupListViewModel(LookupService lookups, IDialogService dialogs, LookupListKind kind)
    {
        this.lookups = lookups;
        this.dialogs = dialogs;
        this.kind = kind;
        SaveNumberCommand = new AsyncRelayCommand<LookupRowViewModel>(SaveNumberAsync);
        AddCommand = new AsyncRelayCommand(AddAsync);
        RenameCommand = new AsyncRelayCommand<LookupRowViewModel>(RenameAsync);
        MoveUpCommand = new AsyncRelayCommand<LookupRowViewModel>(row => MoveAsync(row, -1), row => row?.CanMoveUp == true);
        MoveDownCommand = new AsyncRelayCommand<LookupRowViewModel>(row => MoveAsync(row, 1), row => row?.CanMoveDown == true);
        ArchiveCommand = new AsyncRelayCommand<LookupRowViewModel>(ArchiveAsync, row => row?.CanArchive == true);
        UnarchiveCommand = new AsyncRelayCommand<LookupRowViewModel>(UnarchiveAsync);
    }

    public string Title => kind switch
    {
        LookupListKind.ItemTypes => "Item types",
        LookupListKind.PriorityLevels => "Priority levels",
        _ => "Statuses"
    };

    /// <summary>Priority levels show a Number box on each row and in the add row.</summary>
    public bool IsPriority => kind == LookupListKind.PriorityLevels;

    /// <summary>Statuses show an Open/Done kind picker in the add row.</summary>
    public bool IsStatus => kind == LookupListKind.Statuses;

    /// <summary>The add row's kind picker: 0 for Open, 1 for Done.</summary>
    public int NewStatusKindIndex { get; set; }

    public IReadOnlyList<string> StatusKinds { get; } = ["Open", "Done"];

    /// <summary>The text of the add row's Number box (priority levels only).</summary>
    public string NewNumber
    {
        get => newNumber;
        set => SetProperty(ref newNumber, value);
    }

    /// <summary>Saves the number typed into a priority row's Number box.</summary>
    public IAsyncRelayCommand<LookupRowViewModel> SaveNumberCommand { get; }

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

    private bool IsItemTypes => kind == LookupListKind.ItemTypes;

    private string Singular => kind switch
    {
        LookupListKind.ItemTypes => "item type",
        LookupListKind.PriorityLevels => "priority level",
        _ => "status"
    };

    public async Task LoadAsync()
    {
        var rows = await LoadRowsAsync();
        var activeRows = rows.Where(row => !row.IsArchived).ToList();
        Active.Clear();
        Archived.Clear();

        for (var index = 0; index < activeRows.Count; index++)
        {
            Active.Add(new LookupRowViewModel(activeRows[index], IsItemTypes, index > 0, index < activeRows.Count - 1));
        }

        foreach (var row in rows.Where(row => row.IsArchived))
        {
            Archived.Add(new LookupRowViewModel(row, IsItemTypes, false, false));
        }

        OnPropertyChanged(nameof(HasArchived));
    }

    private async Task<List<LookupEntity>> LoadRowsAsync()
    {
        IEnumerable<LookupEntity> rows = kind switch
        {
            LookupListKind.ItemTypes => await lookups.ItemTypesAsync(),
            LookupListKind.PriorityLevels => await lookups.PriorityLevelsAsync(),
            _ => await lookups.StatusesAsync()
        };

        return rows.OrderBy(row => row.SortOrder).ToList();
    }

    private async Task AddAsync()
    {
        var added = await RunAsync(AddLookupAsync);

        if (added)
        {
            NewName = string.Empty;
            NewNumber = string.Empty;
        }
    }

    private Task AddLookupAsync()
    {
        return kind switch
        {
            LookupListKind.ItemTypes => lookups.AddItemTypeAsync(NewName),
            LookupListKind.PriorityLevels => lookups.AddPriorityLevelAsync(NewName, ParseNumber(NewNumber)),
            _ => lookups.AddStatusAsync(NewName, NewStatusKindIndex == 1 ? StatusKind.Done : StatusKind.Open)
        };
    }

    private async Task SaveNumberAsync(LookupRowViewModel? row)
    {
        if (row is not null)
        {
            await RunAsync(() => lookups.SetPriorityNumberAsync(row.Id, ParseNumber(row.Number)));
        }
    }

    /// <summary>Reads a priority number: blank for none, otherwise a whole number of at least 1.</summary>
    private static int? ParseNumber(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var parsed = int.TryParse(value.Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out var number);
        if (!parsed || number < 1)
        {
            throw new DomainRuleException("Enter a whole priority number of at least 1, or leave it blank.");
        }

        return number;
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
            await RunAsync(() => RenameLookupAsync(row.Id, name));
        }
    }

    private Task RenameLookupAsync(Guid id, string name)
    {
        return kind switch
        {
            LookupListKind.ItemTypes => lookups.RenameItemTypeAsync(id, name),
            LookupListKind.PriorityLevels => lookups.RenamePriorityLevelAsync(id, name),
            _ => lookups.RenameStatusAsync(id, name)
        };
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

        await RunAsync(() => ReorderAsync(ids));
    }

    private Task ReorderAsync(IReadOnlyList<Guid> ids)
    {
        return kind switch
        {
            LookupListKind.ItemTypes => lookups.ReorderItemTypesAsync(ids),
            LookupListKind.PriorityLevels => lookups.ReorderPriorityLevelsAsync(ids),
            _ => lookups.ReorderStatusesAsync(ids)
        };
    }

    private async Task ArchiveAsync(LookupRowViewModel? row)
    {
        if (row is not null)
        {
            await RunAsync(() => SetArchivedAsync(row.Id, true));
        }
    }

    private async Task UnarchiveAsync(LookupRowViewModel? row)
    {
        if (row is not null)
        {
            await RunAsync(() => SetArchivedAsync(row.Id, false));
        }
    }

    private Task SetArchivedAsync(Guid id, bool archived)
    {
        return (kind, archived) switch
        {
            (LookupListKind.ItemTypes, true) => lookups.ArchiveItemTypeAsync(id),
            (LookupListKind.ItemTypes, false) => lookups.UnarchiveItemTypeAsync(id),
            (LookupListKind.PriorityLevels, true) => lookups.ArchivePriorityLevelAsync(id),
            (LookupListKind.PriorityLevels, false) => lookups.UnarchivePriorityLevelAsync(id),
            _ => lookups.SetStatusArchivedAsync(id, archived)
        };
    }

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