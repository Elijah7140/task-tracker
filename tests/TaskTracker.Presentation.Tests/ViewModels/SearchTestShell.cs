using TaskTracker.Core.Calendar;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Core.Trash;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Builds shells and search pages wired to a test database.</summary>
internal static class SearchTestShell
{
    internal static MainWindowViewModel Create(PresentationTestStore store, FakeDialogService? dialogs = null,
        TimeProvider? clock = null, IFieldRegistry? registry = null, IItemSearchService? search = null,
        TimeZoneInfo? timeZone = null, CalendarService? calendar = null, ProjectService? projects = null,
        ITrashService? trash = null)
    {
        registry ??= new FieldRegistry(store.UnitOfWorkFactory);
        var validator = new ItemQueryValidator(store.UnitOfWorkFactory);
        search ??= new ItemSearchService(store.UnitOfWorkFactory, validator);
        return new MainWindowViewModel(projects ?? store.Projects, store.Folders, dialogs ?? new FakeDialogService(),
            store.Items, clock ?? TimeProvider.System, timeZone ?? TimeZoneInfo.Utc, settings: store.Settings,
            lookups: store.Lookups, fields: store.Fields, search: search, registry: registry,
            calendar: calendar ?? new CalendarService(store.UnitOfWorkFactory),
            trash: trash ?? store.Trash,
            rescheduler: new CalendarRescheduleService(store.UnitOfWorkFactory, clock ?? TimeProvider.System));
    }

    internal static SearchViewModel CreatePage(PresentationTestStore store, IItemSearchService search,
        INavigationService? navigation = null, Guid? projectId = null, Guid? folderId = null,
        int resultLimit = SearchViewModel.DefaultResultLimit, IFieldRegistry? registry = null)
    {
        return new SearchViewModel(search, registry ?? new FieldRegistry(store.UnitOfWorkFactory),
            store.Projects, navigation ?? new FakeNavigationService(), projectId, folderId,
            store.Lookups, resultLimit);
    }
}