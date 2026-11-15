using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

internal static class TestWorkspaceFactory
{
    internal static ProjectWorkspaceViewModel CreateItemPage(PresentationTestStore store,
        Guid projectId, FakeDialogService? dialogs = null, TimeProvider? clock = null)
    {
        var fieldLoader = new CustomFieldInputLoader(store.Fields, store.Items);

        return CreateItemPage(store, projectId, fieldLoader, dialogs, clock);
    }

    /// <summary>Creates a workspace whose item operations go through the given unit-of-work factory.</summary>
    internal static ProjectWorkspaceViewModel CreateItemPage(PresentationTestStore store,
        Guid projectId, IUnitOfWorkFactory unitOfWorkFactory)
    {
        var gatedItems = new ItemService(unitOfWorkFactory, TimeProvider.System, TimeZoneInfo.Utc);
        var fieldLoader = new CustomFieldInputLoader(store.Fields, store.Items);

        return new ProjectWorkspaceViewModel(projectId, store.Projects, store.Folders,
            new FakeDialogService(), new FakeNavigationService(), gatedItems,
            null, TimeZoneInfo.Utc, fieldLoader: fieldLoader);
    }

    internal static ProjectWorkspaceViewModel CreateItemPage(PresentationTestStore store,
        Guid projectId, ICustomFieldInputLoader fieldLoader, FakeDialogService? dialogs = null,
        TimeProvider? clock = null)
    {
        return new ProjectWorkspaceViewModel(projectId, store.Projects, store.Folders,
            dialogs ?? new FakeDialogService(), new FakeNavigationService(), store.Items,
            clock, TimeZoneInfo.Utc, fieldLoader: fieldLoader);
    }
}