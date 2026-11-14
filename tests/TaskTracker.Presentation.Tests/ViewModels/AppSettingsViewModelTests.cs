#pragma warning disable xUnit1051
using TaskTracker.Core.Fields;
using TaskTracker.Core.Settings;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class AppSettingsViewModelTests
{
    [Fact]
    public async Task Loading_shows_global_defaults()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = new AppSettingsViewModel(store.Settings, new FakeDialogService(), new FakeNavigationService());

        await page.LoadAsync();

        Assert.True(page.AutoCompleteParents);
        Assert.Equal(3, page.YellowAmount);
        Assert.Equal(24, page.RedAmount);
    }

    [Fact]
    public async Task Red_greater_than_yellow_disables_save()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = new AppSettingsViewModel(store.Settings, new FakeDialogService(), new FakeNavigationService());
        await page.LoadAsync();

        page.RedAmount = 100;
        await page.SaveAsync();

        Assert.False(page.CanSave);
        Assert.Equal(TimeSpan.FromHours(24), await store.Settings.GetGlobalAsync(SettingsCatalogue.UrgencyRedThreshold));
    }

    [Fact]
    public async Task Saving_thresholds_persists_global_values()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = new AppSettingsViewModel(store.Settings, new FakeDialogService(), new FakeNavigationService());
        await page.LoadAsync();

        page.YellowAmount = 4;
        page.RedAmount = 30;
        await page.SaveAsync();

        Assert.Equal(TimeSpan.FromDays(4), await store.Settings.GetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold));
        Assert.Equal(TimeSpan.FromHours(30), await store.Settings.GetGlobalAsync(SettingsCatalogue.UrgencyRedThreshold));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Enabling_auto_complete_reconciles_only_after_confirmation(bool confirmed)
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, false);
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        await store.Items.CreateAsync(project.Id, null, parent.Id, "Open child");
        await store.Items.SetCompletedAsync(project.Id, null, parent.Id, true);
        var dialogs = new FakeDialogService { ConfirmResult = confirmed };
        var page = new AppSettingsViewModel(store.Settings, dialogs, new FakeNavigationService());
        await page.LoadAsync();

        page.AutoCompleteParents = true;
        await page.SaveAsync();

        var area = await store.Items.LoadAreaAsync(project.Id, null);
        var savedParent = Assert.Single(area.Items).Item;
        Assert.Equal(confirmed, await store.Settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents));
        Assert.Equal(!confirmed, savedParent.CompletedAtUtc is not null);
    }

    [Fact]
    public async Task Enabling_auto_complete_without_disagreement_needs_no_prompt()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        await store.Settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, false);
        var dialogs = new FakeDialogService();
        var page = new AppSettingsViewModel(store.Settings, dialogs, new FakeNavigationService());
        await page.LoadAsync();

        page.AutoCompleteParents = true;
        await page.SaveAsync();

        Assert.True(await store.Settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents));
        Assert.Empty(dialogs.Messages);
    }

    [Fact]
    public async Task Turning_auto_complete_off_leaves_parent_completion_unchanged()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await store.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        await store.Items.SetCompletedAsync(project.Id, null, child.Id, true);
        var page = new AppSettingsViewModel(store.Settings, new FakeDialogService(), new FakeNavigationService());
        await page.LoadAsync();

        page.AutoCompleteParents = false;
        await page.SaveAsync();

        var saved = Assert.Single((await store.Items.LoadAreaAsync(project.Id, null)).Items).Item;
        Assert.False(await store.Settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents));
        Assert.NotNull(saved.CompletedAtUtc);
    }

    [Fact]
    public async Task Invalid_project_effective_thresholds_leave_both_global_values_unchanged()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Settings.SetProjectOverrideAsync(project.Id,
            SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(2));
        var page = new AppSettingsViewModel(store.Settings, new FakeDialogService(), new FakeNavigationService());
        await page.LoadAsync();

        page.YellowAmount = 4;
        page.RedAmount = 72;
        await page.SaveAsync();

        Assert.NotNull(page.Error);
        Assert.Equal(TimeSpan.FromDays(3), await store.Settings.GetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold));
        Assert.Equal(TimeSpan.FromHours(24), await store.Settings.GetGlobalAsync(SettingsCatalogue.UrgencyRedThreshold));
    }

    [Fact]
    public async Task Failed_save_persists_none_of_the_three_values_and_names_the_conflicting_project()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing DB");
        await store.Settings.SetProjectOverrideAsync(project.Id,
            SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(2));
        var page = new AppSettingsViewModel(store.Settings, new FakeDialogService(), new FakeNavigationService());
        await page.LoadAsync();

        page.AutoCompleteParents = false;
        page.YellowAmount = 4;
        page.RedAmount = 72;
        await page.SaveAsync();

        Assert.Equal("Project 'Billing DB' overrides the yellow threshold to 2 days, so the red threshold can't exceed it.",
            page.Error);
        Assert.True(await store.Settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents));
        Assert.Equal(TimeSpan.FromDays(3), await store.Settings.GetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold));
        Assert.Equal(TimeSpan.FromHours(24), await store.Settings.GetGlobalAsync(SettingsCatalogue.UrgencyRedThreshold));
    }

    [Fact]
    public async Task Save_is_disabled_until_something_changes_and_after_saving()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = new AppSettingsViewModel(store.Settings, new FakeDialogService(), new FakeNavigationService());
        await page.LoadAsync();
        var cleanAfterLoad = page.CanSave;

        page.YellowAmount = 5;
        var dirtyAfterEdit = page.CanSave;
        await page.SaveAsync();

        Assert.False(cleanAfterLoad);
        Assert.True(dirtyAfterEdit);
        Assert.False(page.CanSave);
        Assert.False(page.IsDirty);
    }

    [Fact]
    public async Task Back_without_changes_navigates_without_prompting()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var dialogs = new FakeDialogService();
        var navigation = new FakeNavigationService();
        var page = new AppSettingsViewModel(store.Settings, dialogs, navigation);
        await page.LoadAsync();

        await ((CommunityToolkit.Mvvm.Input.IAsyncRelayCommand)page.BackCommand).ExecuteAsync(null);

        Assert.True(navigation.WentHome);
        Assert.Empty(dialogs.ConfirmTitles);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Back_with_unsaved_changes_asks_before_discarding(bool discard)
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var dialogs = new FakeDialogService { ConfirmResult = discard };
        var navigation = new FakeNavigationService();
        var page = new AppSettingsViewModel(store.Settings, dialogs, navigation);
        await page.LoadAsync();

        page.YellowAmount = 5;
        await ((CommunityToolkit.Mvvm.Input.IAsyncRelayCommand)page.BackCommand).ExecuteAsync(null);

        Assert.Equal("Discard unsaved settings?", Assert.Single(dialogs.ConfirmTitles));
        Assert.Equal(discard, navigation.WentHome);
        Assert.Equal(TimeSpan.FromDays(3), await store.Settings.GetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold));
    }

    [Fact]
    public async Task Loading_the_page_loads_the_global_custom_fields()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, null);
        await store.Fields.CreateAsync("Project note", FieldDataType.Text, project.Id);
        var page = new AppSettingsViewModel(store.Settings, new FakeDialogService(),
            new FakeNavigationService(), fields: store.Fields);

        await page.LoadAsync();

        Assert.Equal(["Effort"], page.CustomFields!.Rows.Select(row => row.Name));
    }

    [Fact]
    public async Task Without_a_field_service_the_page_has_no_custom_field_manager()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = new AppSettingsViewModel(store.Settings, new FakeDialogService(), new FakeNavigationService());

        await page.LoadAsync();

        Assert.Null(page.CustomFields);
    }
}