using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Builds a scoped query and displays bounded search results.</summary>
public sealed partial class SearchViewModel : ViewModelBase, IDisposable
{
    /// <summary>The number of matches shown unless a different limit is given.</summary>
    public const int DefaultResultLimit = 200;

    private const string MissingItemMessage = "This item no longer exists";

    private readonly IItemSearchService search;
    private readonly IFieldRegistry registry;
    private readonly INavigationService navigation;
    private readonly SearchResultFactory resultFactory;
    private readonly Guid? originProjectId;
    private readonly Guid? originFolderId;
    private readonly int resultLimit;
    private IReadOnlyList<SearchableField> fields = [];
    private CancellationTokenSource? searchCancellation;
    private CancellationTokenSource? scopeCancellation;
    private bool disposed;
    private bool isOpeningResult;
    private SearchScopeOption selectedScope;
    private string text = string.Empty;
    private string? error;
    private int scopeVersion;
    private int searchVersion;
    private bool includeSubfolders = true;
    private bool includeCompleted;
    private bool isBusy;
    private bool hasSearched;
    private bool hasMore;

    /// <summary>Creates the page; the origin ids choose the default scope (see the scope options).</summary>
    public SearchViewModel(IItemSearchService search, IFieldRegistry registry, ProjectService projects,
        INavigationService navigation, Guid? projectId, Guid? folderId, LookupService? lookups,
        int resultLimit = DefaultResultLimit, ItemQueryParser? parser = null,
        SavedSearchService? savedSearchService = null, IDialogService? dialogs = null,
        TransferServices? transfer = null)
    {
        exportServices = transfer;
        exportDialogs = dialogs;
        this.parser = parser;
        this.search = search;
        this.registry = registry;
        this.navigation = navigation;
        this.resultLimit = resultLimit;
        resultFactory = new SearchResultFactory(projects, lookups);
        originProjectId = projectId;
        originFolderId = folderId;
        ScopeOptions = CreateScopeOptions(projectId, folderId);
        selectedScope = folderId is null && projectId is not null ? ScopeOptions[1] : ScopeOptions[^1];
        SearchCommand = new AsyncRelayCommand(SubmitAsync, AsyncRelayCommandOptions.AllowConcurrentExecutions);
        AddFilterCommand = new RelayCommand(() => CreateRow());
        SavedSearches = CreateSavedSearchList(savedSearchService, dialogs);
        BackCommand = new AsyncRelayCommand(navigation.ReturnFromSearchAsync);
        OpenResultCommand = new AsyncRelayCommand<SearchResultViewModel>(OpenResultAsync);
        ExportResultsCommand = new AsyncRelayCommand(ExportResultsAsync, () => CanExportResults);
        Results.CollectionChanged += OnResultsChanged;
    }

    /// <summary>All projects, plus This project and This folder when opened from a workspace.</summary>
    public IReadOnlyList<SearchScopeOption> ScopeOptions { get; }

    /// <summary>The field-list refresh started by the latest scope change, for callers that must wait for it.</summary>
    public Task ScopeRefreshTask { get; private set; } = Task.CompletedTask;

    public ObservableCollection<SearchFilterRowViewModel> Filters { get; } = [];

    public ObservableCollection<SearchResultViewModel> Results { get; } = [];

    public ICommand SearchCommand { get; }

    public ICommand AddFilterCommand { get; }

    public ICommand BackCommand { get; }

    public ICommand OpenResultCommand { get; }

    public SearchResultViewModel? SelectedResult { get; set; }

    /// <summary>Free text matched against title, description and ticket number.</summary>
    public string Text
    {
        get => text;
        set
        {
            if (SetProperty(ref text, value))
            {
                RefreshQueryText();
            }
        }
    }

    /// <summary>The chosen scope; changing it refreshes the filter fields.</summary>
    public SearchScopeOption SelectedScope
    {
        get => selectedScope;
        set
        {
            if (value is not null && SetProperty(ref selectedScope, value))
            {
                OnPropertyChanged(nameof(IsFolderScope));
                ScopeRefreshTask = RefreshFieldsAsync();
            }
        }
    }

    public bool IsFolderScope => SelectedScope.Kind == SearchScopeKind.Folder;

    public bool IncludeSubfolders
    {
        get => includeSubfolders;
        set => SetProperty(ref includeSubfolders, value);
    }

    public bool IncludeCompleted
    {
        get => includeCompleted;
        set => SetProperty(ref includeCompleted, value);
    }

    public bool IsBusy
    {
        get => isBusy;
        private set
        {
            if (SetProperty(ref isBusy, value))
            {
                OnPropertyChanged(nameof(ShowEmpty));
            }
        }
    }

    /// <summary>True when every filter row is complete and valid.</summary>
    public bool CanSearch => queryTextEdited || Filters.All(row => row.IsValid && row.IsComplete);

    /// <summary>The message for the last failed search, filter load or result activation.</summary>
    public string? Error
    {
        get => error;
        private set => SetProperty(ref error, value);
    }

    public bool ShowEmpty => hasSearched && !IsBusy && Results.Count == 0;

    /// <summary>True when more items matched than the result limit allows.</summary>
    public bool HasMore
    {
        get => hasMore;
        private set => SetProperty(ref hasMore, value);
    }

    /// <summary>The note shown when <see cref="HasMore"/> is true; it names the actual limit.</summary>
    public string HasMoreMessage => $"Showing the first {resultLimit} matches — narrow your search";

    /// <summary>Loads the filter fields for the starting scope.</summary>
    public async Task LoadAsync()
    {
        ScopeRefreshTask = RefreshFieldsAsync();
        await ScopeRefreshTask;
        await LoadSavedSearchesAsync();
    }

    /// <summary>Reloads search metadata and saved searches, then reruns a previously submitted query.</summary>
    public async Task RefreshAsync()
    {
        await LoadSavedSearchesAsync();
        var refresh = RefreshFieldsAsync(refreshFilters: true);
        ScopeRefreshTask = refresh;
        if (await refresh && hasSearched)
        {
            await RunAsync();
        }
    }

    /// <summary>
    /// Runs the search. A newer search cancels and replaces an older one; errors appear in
    /// <see cref="Error"/> instead of escaping.
    /// </summary>
    public async Task RunAsync()
    {
        if (disposed || !CanSearch)
        {
            return;
        }

        var version = ++searchVersion;
        var cancellation = ReplaceCancellation(ref searchCancellation);
        BeginSearch();

        try
        {
            await TrySearchAsync(version, cancellation);
        }
        finally
        {
            ReleaseCancellation(ref searchCancellation, cancellation);

            if (IsCurrentSearch(version))
            {
                EndSearch();
            }
        }
    }

    /// <summary>
    /// Opens the item behind a result. Only one activation runs at a time, and an answer that
    /// arrives after the page was left is ignored. When the item was deleted meanwhile, the page
    /// stays and says so.
    /// </summary>
    public async Task OpenResultAsync(SearchResultViewModel? row)
    {
        if (disposed || row is null || isOpeningResult)
        {
            return;
        }

        isOpeningResult = true;

        try
        {
            var outcome = await navigation.OpenSearchResultAsync(row.Item);

            if (!disposed && outcome == SearchOpenOutcome.ItemMissing)
            {
                Error = MissingItemMessage;
            }
        }
        catch (Exception exception)
        {
            if (!disposed)
            {
                ShowError(exception);
            }
        }
        finally
        {
            isOpeningResult = false;
        }
    }

    /// <summary>Cancels outstanding search, field, and choice work when the page closes.</summary>
    public void Dispose()
    {
        if (disposed)
        {
            return;
        }

        disposed = true;
        searchVersion++;
        scopeVersion++;
        searchCancellation?.Cancel();
        scopeCancellation?.Cancel();

        foreach (var row in Filters)
        {
            row.PropertyChanged -= OnFilterChanged;
            row.Dispose();
        }
    }

    private static IReadOnlyList<SearchScopeOption> CreateScopeOptions(Guid? projectId, Guid? folderId)
    {
        var options = new List<SearchScopeOption> { new(SearchScopeKind.AllProjects, "All projects") };

        if (projectId is not null)
        {
            options.Add(new SearchScopeOption(SearchScopeKind.Project, "This project"));
            options.Add(new SearchScopeOption(SearchScopeKind.Root, "Project root only"));
        }

        if (folderId is not null)
        {
            options.Add(new SearchScopeOption(SearchScopeKind.Folder, "This folder"));
        }

        return options;
    }

    private void BeginSearch()
    {
        IsBusy = true;
        Error = null;
        OnPropertyChanged(nameof(CanSearch));
    }

    private void EndSearch()
    {
        IsBusy = false;
        OnPropertyChanged(nameof(ShowEmpty));
        OnPropertyChanged(nameof(CanSearch));
    }

    private async Task TrySearchAsync(int version, CancellationTokenSource cancellation)
    {
        try
        {
            await SearchAndShowAsync(version, cancellation.Token);
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            if (IsCurrentSearch(version))
            {
                ShowError(exception);
            }
        }
    }

    private bool IsCurrentSearch(int version)
    {
        return !disposed && version == searchVersion;
    }

    private bool IsCurrentScope(int version)
    {
        return !disposed && version == scopeVersion;
    }

    /// <summary>Cancels the work in <paramref name="slot"/> and puts a fresh source in its place.</summary>
    private static CancellationTokenSource ReplaceCancellation(ref CancellationTokenSource? slot)
    {
        slot?.Cancel();
        var replacement = new CancellationTokenSource();
        slot = replacement;
        return replacement;
    }

    /// <summary>Empties the slot when it still holds the finished source, then disposes that source.</summary>
    private static void ReleaseCancellation(ref CancellationTokenSource? slot, CancellationTokenSource finished)
    {
        if (ReferenceEquals(slot, finished))
        {
            slot = null;
        }

        finished.Dispose();
    }

    private async Task SearchAndShowAsync(int version, CancellationToken cancellationToken)
    {
        var query = CreateQuery();
        var result = await search.SearchAsync(query, resultLimit, cancellationToken);
        var rows = await resultFactory.CreateAsync(result.Items, cancellationToken);

        var (statuses, priorities) = await navigation.LoadRowLookupsAsync(cancellationToken);
        if (IsCurrentSearch(version))
        {
            lastQuery = query;
            ApplyResults(rows, result.HasMore, new RowLookupMenus(statuses, priorities));
        }
    }

    private void ApplyResults(IReadOnlyList<SearchResultViewModel> rows, bool moreAvailable, RowLookupMenus menus)
    {
        Results.Clear();

        foreach (var row in rows)
        {
            AttachRowActions(row, menus);
            Results.Add(row);
        }

        HasMore = moreAvailable;
        hasSearched = true;
        OnPropertyChanged(nameof(ShowEmpty));
    }

    /// <summary>Wires a result's context menu: push back, Set status and Set priority.</summary>
    private void AttachRowActions(SearchResultViewModel row, RowLookupMenus menus)
    {
        var item = row.Item;
        row.SetCurrentCommand = new AsyncRelayCommand(() => navigation.SetCurrentItemAsync(item.ItemId));
        row.PushBackCommand = new AsyncRelayCommand(() => navigation.PushBackAsync(item.ItemId),
            () => row.PushBackReason is null);
        row.StatusName = menus.StatusName(item.StatusId);
        row.StatusChoices = menus.Statuses(item.StatusId,
            id => navigation.SetRowStatusAsync(item.ItemId, id));
        row.PriorityChoices = menus.Priorities(item.PriorityLevelId,
            id => navigation.SetRowPriorityAsync(item.ItemId, id));
    }

    private void ShowError(Exception exception)
    {
        if (exception is DomainRuleException)
        {
            Error = exception.Message;
            return;
        }

        Error = $"Something went wrong: {exception.Message}";
    }

    private ItemQuery CreateQuery()
    {
        var filters = new List<FieldFilter>();

        foreach (var row in Filters)
        {
            var filter = row.ToFilter();

            if (filter is not null)
            {
                filters.Add(filter);
            }
        }

        return new ItemQuery(CurrentScope(), Text, filters, IncludeCompleted);
    }

    private SearchScope CurrentScope()
    {
        if (originProjectId is not Guid projectId)
        {
            return new SearchScope.AllProjects();
        }

        return SelectedScope.Kind switch
        {
            SearchScopeKind.Project => new SearchScope.Project(projectId),
            SearchScopeKind.Root => new SearchScope.Area(projectId, null, false),
            SearchScopeKind.Folder => new SearchScope.Area(projectId, originFolderId, IncludeSubfolders),
            _ => new SearchScope.AllProjects()
        };
    }

    private async Task<bool> RefreshFieldsAsync(bool refreshFilters = false)
    {
        if (disposed)
        {
            return false;
        }

        var version = ++scopeVersion;
        var cancellation = ReplaceCancellation(ref scopeCancellation);

        try
        {
            return await TryLoadFieldsAsync(version, cancellation, refreshFilters);
        }
        finally
        {
            ReleaseCancellation(ref scopeCancellation, cancellation);
        }
    }

    private async Task<bool> TryLoadFieldsAsync(int version, CancellationTokenSource cancellation, bool refreshFilters)
    {
        try
        {
            var available = await registry.GetFieldsAsync(CurrentScope(), cancellation.Token);

            if (!IsCurrentScope(version))
            {
                return false;
            }

            if (refreshFilters)
            {
                return await RebuildValidFiltersAsync(available, version);
            }

            ApplyFields(available);
            return true;
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            if (IsCurrentScope(version))
            {
                ShowError(exception);
            }
        }

        return false;
    }

    private async Task<bool> RebuildValidFiltersAsync(IReadOnlyList<SearchableField> available, int version)
    {
        var rebuilt = new List<SearchFilterRowViewModel>();
        foreach (var original in Filters.ToArray())
        {
            if (!IsCurrentScope(version))
            {
                break;
            }

            if (FilterStillOffered(original, available) && original.ToFilter() is { } filter)
            {
                var row = new SearchFilterRowViewModel(registry, available, RemoveFilter, ShowError);
                await row.ApplyAsync(filter);
                if (row.IsValid && row.IsComplete)
                {
                    rebuilt.Add(row);
                }
                else
                {
                    row.Dispose();
                }
            }
        }

        if (!IsCurrentScope(version))
        {
            rebuilt.ForEach(row => row.Dispose());
            return false;
        }

        ReplaceFilters(available, rebuilt);
        return true;
    }

    private static bool FilterStillOffered(SearchFilterRowViewModel row, IReadOnlyList<SearchableField> available)
    {
        return row.IsValid && row.IsComplete && row.SelectedField is { } selected && available.Any(field =>
            field.Key == selected.Key && field.DataType == selected.DataType && field.FieldDefinitionId == selected.FieldDefinitionId);
    }

    private void ReplaceFilters(IReadOnlyList<SearchableField> available, List<SearchFilterRowViewModel> rebuilt)
    {
        syncSuspended = true;
        try
        {
            fields = available;
            ClearFilters();
            foreach (var row in rebuilt)
            {
                row.PropertyChanged += OnFilterChanged;
                Filters.Add(row);
            }
        }
        finally
        {
            syncSuspended = false;
        }

        OnPropertyChanged(nameof(CanSearch));
        if (!queryTextEdited)
        {
            RefreshQueryText();
        }
    }

    private void ApplyFields(IReadOnlyList<SearchableField> available)
    {
        fields = available;

        foreach (var row in Filters.ToArray())
        {
            if (IsUnavailable(row.SelectedField))
            {
                RemoveFilter(row);
            }
            else
            {
                row.UpdateFields(fields);
            }
        }
    }

    private bool IsUnavailable(SearchableField? field)
    {
        return field is not null && !fields.Any(candidate => candidate.Key == field.Key);
    }

    private SearchFilterRowViewModel CreateRow()
    {
        var row = new SearchFilterRowViewModel(registry, fields, RemoveFilter, ShowError);
        row.PropertyChanged += OnFilterChanged;
        Filters.Add(row);
        OnPropertyChanged(nameof(CanSearch));
        RefreshQueryText();
        return row;
    }

    private void RemoveFilter(SearchFilterRowViewModel row)
    {
        row.PropertyChanged -= OnFilterChanged;
        row.Dispose();
        Filters.Remove(row);
        OnPropertyChanged(nameof(CanSearch));
        RefreshQueryText();
    }

    private void OnFilterChanged(object? sender, PropertyChangedEventArgs args)
    {
        RefreshQueryText();

        if (args.PropertyName is nameof(SearchFilterRowViewModel.IsValid)
            or nameof(SearchFilterRowViewModel.IsComplete))
        {
            OnPropertyChanged(nameof(CanSearch));
        }
    }
}