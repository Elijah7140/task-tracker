using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

internal static class TestWorkspaceFactory
{
    internal static ProjectWorkspaceViewModel CreateItemPage(PresentationTestStore store,
        Guid projectId, FakeDialogService? dialogs = null, TimeProvider? clock = null)
    {
        return new ProjectWorkspaceViewModel(projectId, store.Projects, store.Folders,
            dialogs ?? new FakeDialogService(), new FakeNavigationService(), store.Items,
            clock, TimeZoneInfo.Utc);
    }
}