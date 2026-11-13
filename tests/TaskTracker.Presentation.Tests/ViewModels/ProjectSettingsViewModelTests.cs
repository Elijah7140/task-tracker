#pragma warning disable xUnit1051
using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class ProjectSettingsViewModelTests
{
    [Fact]
    public async Task Loading_shows_inherited_values()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");

        var page = await LoadPageAsync(store, project, new FakeDialogService(), new FakeNavigationService());

        Assert.False(page.OverrideYellow);
        Assert.Equal("Inherited from global", page.YellowSource);
        Assert.Equal(3, page.YellowDays);
        Assert.False(page.IsDirty);
    }

    [Fact]
    public async Task Loading_shows_overridden_values_with_their_source()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(5));

        var page = await LoadPageAsync(store, project, new FakeDialogService(), new FakeNavigationService());

        Assert.True(page.OverrideYellow);
        Assert.Equal("Project override", page.YellowSource);
        Assert.Equal(5, page.YellowDays);
        Assert.False(page.OverrideRed);
        Assert.Equal("Inherited from global", page.RedSource);
    }

    [Fact]
    public async Task Editing_an_override_and_saving_persists_it()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var page = await LoadPageAsync(store, project, new FakeDialogService(), new FakeNavigationService());

        page.OverrideYellow = true;
        page.YellowDays = 5;
        await page.SaveAsync();

        var effective = await store.Settings.GetEffectiveAsync(project.Id);
        Assert.Equal(SettingSource.Project, effective.UrgencyYellowThreshold.Source);
        Assert.Equal(TimeSpan.FromDays(5), effective.UrgencyYellowThreshold.Value);
        Assert.False(page.IsDirty);
    }

    [Fact]
    public async Task Reset_alone_changes_the_form_but_persists_nothing()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(5));
        var page = await LoadPageAsync(store, project, new FakeDialogService(), new FakeNavigationService());

        page.ResetYellowCommand.Execute(null);

        Assert.False(page.OverrideYellow);
        Assert.Equal(3, page.YellowDays);
        Assert.True(page.IsDirty);
        Assert.Equal(SettingSource.Project, (await store.Settings.GetEffectiveAsync(project.Id)).UrgencyYellowThreshold.Source);
    }

    [Fact]
    public async Task Reset_then_save_clears_the_override()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(5));
        var page = await LoadPageAsync(store, project, new FakeDialogService(), new FakeNavigationService());

        page.ResetYellowCommand.Execute(null);
        await page.SaveAsync();

        var effective = await store.Settings.GetEffectiveAsync(project.Id);
        Assert.Equal(SettingSource.Global, effective.UrgencyYellowThreshold.Source);
        Assert.False(page.IsDirty);
    }

    [Fact]
    public async Task Reset_is_available_only_on_overridden_rows()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(5));

        var page = await LoadPageAsync(store, project, new FakeDialogService(), new FakeNavigationService());

        Assert.True(page.ResetYellowCommand.CanExecute(null));
        Assert.False(page.ResetRedCommand.CanExecute(null));
        Assert.False(page.ResetAutoCommand.CanExecute(null));

        page.ResetYellowCommand.Execute(null);

        Assert.False(page.ResetYellowCommand.CanExecute(null));
    }

    [Fact]
    public async Task Red_greater_than_yellow_disables_save()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var page = await LoadPageAsync(store, project, new FakeDialogService(), new FakeNavigationService());

        page.OverrideRed = true;
        page.RedHours = 100;
        await page.SaveAsync();

        Assert.NotNull(page.Error);
        Assert.False(page.CanSave);
        Assert.Equal(SettingSource.Global, (await store.Settings.GetEffectiveAsync(project.Id)).UrgencyRedThreshold.Source);
    }

    [Fact]
    public async Task Save_is_disabled_until_something_changes()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var page = await LoadPageAsync(store, project, new FakeDialogService(), new FakeNavigationService());
        var cleanAfterLoad = page.CanSave;

        page.OverrideYellow = true;

        Assert.False(cleanAfterLoad);
        Assert.True(page.CanSave);
    }

    [Fact]
    public async Task Confirmed_override_enable_reconciles_the_disagreeing_parent()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, parentId) = await CreateDisagreeingProjectAsync(store);
        var dialogs = new FakeDialogService { ConfirmResult = true };
        var page = await LoadPageAsync(store, project, dialogs, new FakeNavigationService());

        page.AutoCompleteParents = true;
        await page.SaveAsync();

        var parent = Assert.Single((await store.Items.LoadAreaAsync(project.Id, null)).Items, row => row.Item.Id == parentId);
        Assert.True((await store.Settings.GetEffectiveAsync(project.Id)).AutoCompleteParents.Value);
        Assert.Null(parent.Item.CompletedAtUtc);
        Assert.Equal("Turn on auto-complete", Assert.Single(dialogs.ConfirmTitles));
    }

    [Fact]
    public async Task Cancelled_override_enable_persists_nothing()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, parentId) = await CreateDisagreeingProjectAsync(store);
        var page = await LoadPageAsync(store, project, new FakeDialogService { ConfirmResult = false }, new FakeNavigationService());

        page.AutoCompleteParents = true;
        page.OverrideYellow = true;
        page.YellowDays = 6;
        await page.SaveAsync();

        var parent = Assert.Single((await store.Items.LoadAreaAsync(project.Id, null)).Items, row => row.Item.Id == parentId);
        var effective = await store.Settings.GetEffectiveAsync(project.Id);
        Assert.False(effective.AutoCompleteParents.Value);
        Assert.Equal(SettingSource.Global, effective.UrgencyYellowThreshold.Source);
        Assert.NotNull(parent.Item.CompletedAtUtc);
    }

    [Fact]
    public async Task Reset_of_a_disabled_override_that_turns_auto_complete_on_prompts_on_save()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var (project, _) = await CreateDisagreeingProjectAsync(store);
        var dialogs = new FakeDialogService { ConfirmResult = false };
        var page = await LoadPageAsync(store, project, dialogs, new FakeNavigationService());

        page.ResetAutoCommand.Execute(null);
        await page.SaveAsync();

        Assert.Equal("Turn on auto-complete", Assert.Single(dialogs.ConfirmTitles));
        Assert.Equal(SettingSource.Project, (await store.Settings.GetEffectiveAsync(project.Id)).AutoCompleteParents.Source);
    }

    [Fact]
    public async Task Back_without_changes_navigates_without_prompting()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var dialogs = new FakeDialogService();
        var navigation = new FakeNavigationService();
        var page = await LoadPageAsync(store, project, dialogs, navigation);

        await ((IAsyncRelayCommand)page.BackCommand).ExecuteAsync(null);

        Assert.Equal(project.Id, navigation.OpenedProjectId);
        Assert.Empty(dialogs.ConfirmTitles);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Back_with_unsaved_changes_asks_before_discarding(bool discard)
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var dialogs = new FakeDialogService { ConfirmResult = discard };
        var navigation = new FakeNavigationService();
        var page = await LoadPageAsync(store, project, dialogs, navigation);

        page.OverrideYellow = true;
        await ((IAsyncRelayCommand)page.BackCommand).ExecuteAsync(null);

        Assert.Equal("Discard unsaved settings?", Assert.Single(dialogs.ConfirmTitles));
        Assert.Equal(discard ? project.Id : (Guid?)null, navigation.OpenedProjectId);
    }

    private static async Task<ProjectSettingsViewModel> LoadPageAsync(PresentationTestStore store,
        Project project, FakeDialogService dialogs, FakeNavigationService navigation)
    {
        var page = new ProjectSettingsViewModel(project.Id, store.Settings, dialogs, navigation);
        await page.LoadAsync(project.Name);

        return page;
    }

    private static async Task<(Project Project, Guid ParentId)> CreateDisagreeingProjectAsync(PresentationTestStore store)
    {
        var project = await store.Projects.CreateAsync("Billing");
        await store.Settings.SetProjectOverrideAsync(project.Id, SettingsCatalogue.AutoCompleteParents, false);
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        await store.Items.CreateAsync(project.Id, null, parent.Id, "Open child");
        await store.Items.SetCompletedAsync(project.Id, null, parent.Id, true);

        return (project, parent.Id);
    }
}