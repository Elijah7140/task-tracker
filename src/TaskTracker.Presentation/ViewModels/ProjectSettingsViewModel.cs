using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Settings;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Edits a project's optional overrides and shows inherited values. Nothing is saved until
/// Save; "Reset to global" only edits the form.
/// </summary>
public sealed class ProjectSettingsViewModel : ViewModelBase
{
    private readonly Guid projectId;
    private readonly SettingsService settings;
    private readonly IDialogService dialogs;
    private readonly INavigationService navigation;
    private readonly RelayCommand resetAutoCommand;
    private readonly RelayCommand resetYellowCommand;
    private readonly RelayCommand resetRedCommand;
    private bool overrideAutoComplete;
    private bool autoCompleteParents;
    private bool overrideYellow;
    private bool overrideRed;
    private double yellowDays;
    private double redHours;
    private string? error;
    private bool globalAutoComplete;
    private double globalYellowDays;
    private double globalRedHours;
    private Overrides saved;

    public ProjectSettingsViewModel(Guid projectId, SettingsService settings,
        IDialogService dialogs, INavigationService navigation, FieldService? fields = null)
    {
        this.projectId = projectId;
        this.settings = settings;
        this.dialogs = dialogs;
        this.navigation = navigation;
        if (fields is not null)
        {
            CustomFields = new FieldManagerViewModel(fields, dialogs, projectId);
        }
        SaveCommand = new AsyncRelayCommand(SaveAsync);
        BackCommand = new AsyncRelayCommand(BackAsync);
        resetAutoCommand = new RelayCommand(() => OverrideAutoComplete = false, () => OverrideAutoComplete);
        resetYellowCommand = new RelayCommand(() => OverrideYellow = false, () => OverrideYellow);
        resetRedCommand = new RelayCommand(() => OverrideRed = false, () => OverrideRed);
    }

    public string ProjectName { get; private set; } = string.Empty;

    public bool OverrideAutoComplete
    {
        get => overrideAutoComplete;
        set
        {
            SetProperty(ref overrideAutoComplete, value);

            if (!value)
            {
                autoCompleteParents = globalAutoComplete;
                OnPropertyChanged(nameof(AutoCompleteParents));
            }

            OnPropertyChanged(nameof(AutoSource));
            resetAutoCommand.NotifyCanExecuteChanged();
            Validate();
        }
    }

    public bool AutoCompleteParents
    {
        get => autoCompleteParents;
        set
        {
            SetProperty(ref autoCompleteParents, value);
            Validate();
        }
    }

    public bool OverrideYellow
    {
        get => overrideYellow;
        set
        {
            SetProperty(ref overrideYellow, value);

            if (!value)
            {
                yellowDays = globalYellowDays;
                OnPropertyChanged(nameof(YellowDays));
            }

            OnPropertyChanged(nameof(YellowSource));
            resetYellowCommand.NotifyCanExecuteChanged();
            Validate();
        }
    }

    public bool OverrideRed
    {
        get => overrideRed;
        set
        {
            SetProperty(ref overrideRed, value);

            if (!value)
            {
                redHours = globalRedHours;
                OnPropertyChanged(nameof(RedHours));
            }

            OnPropertyChanged(nameof(RedSource));
            resetRedCommand.NotifyCanExecuteChanged();
            Validate();
        }
    }

    public double YellowDays
    {
        get => yellowDays;
        set
        {
            SetProperty(ref yellowDays, value);
            Validate();
        }
    }

    public double RedHours
    {
        get => redHours;
        set
        {
            SetProperty(ref redHours, value);
            Validate();
        }
    }

    public string AutoSource => SourceText(OverrideAutoComplete);

    public string YellowSource => SourceText(OverrideYellow);

    public string RedSource => SourceText(OverrideRed);

    public string? Error
    {
        get => error;
        private set => SetProperty(ref error, value);
    }

    /// <summary>True when the form differs from what was last loaded or saved.</summary>
    public bool IsDirty => CurrentOverrides() != saved;

    public bool CanSave => Error is null && IsDirty;

    public ICommand SaveCommand { get; }

    public ICommand BackCommand { get; }

    public FieldManagerViewModel? CustomFields { get; }

    /// <summary>Unticks the override and shows the global value; takes effect only when saved.</summary>
    public ICommand ResetAutoCommand => resetAutoCommand;

    /// <inheritdoc cref="ResetAutoCommand"/>
    public ICommand ResetYellowCommand => resetYellowCommand;

    /// <inheritdoc cref="ResetAutoCommand"/>
    public ICommand ResetRedCommand => resetRedCommand;

    public async Task LoadAsync(string projectName)
    {
        ProjectName = projectName;
        OnPropertyChanged(nameof(ProjectName));
        var effective = await settings.GetEffectiveAsync(projectId);
        globalAutoComplete = await settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents);
        globalYellowDays = (await settings.GetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold)).TotalDays;
        globalRedHours = (await settings.GetGlobalAsync(SettingsCatalogue.UrgencyRedThreshold)).TotalHours;
        OverrideAutoComplete = effective.AutoCompleteParents.Source == SettingSource.Project;
        AutoCompleteParents = effective.AutoCompleteParents.Value;
        OverrideYellow = effective.UrgencyYellowThreshold.Source == SettingSource.Project;
        OverrideRed = effective.UrgencyRedThreshold.Source == SettingSource.Project;
        YellowDays = effective.UrgencyYellowThreshold.Value.TotalDays;
        RedHours = effective.UrgencyRedThreshold.Value.TotalHours;
        saved = CurrentOverrides();
        Validate();
        if (CustomFields is not null)
        {
            await CustomFields.LoadAsync();
        }
    }

    public async Task SaveAsync()
    {
        Validate();

        if (!CanSave)
        {
            return;
        }

        try
        {
            var values = CurrentOverrides();

            if (await ConfirmAutoCompleteAsync(values))
            {
                await settings.SaveProjectAsync(projectId, values.AutoComplete, values.Yellow, values.Red, confirmed: true);
                await LoadAsync(ProjectName);
            }
        }
        catch (DomainRuleException exception)
        {
            Error = exception.Message;
            OnPropertyChanged(nameof(CanSave));
        }
    }

    private Overrides CurrentOverrides()
    {
        return new Overrides(
            OverrideAutoComplete ? AutoCompleteParents : null,
            OverrideYellow ? TimeSpan.FromDays(YellowDays) : null,
            OverrideRed ? TimeSpan.FromHours(RedHours) : null);
    }

    private async Task<bool> ConfirmAutoCompleteAsync(Overrides values)
    {
        var current = await settings.GetEffectiveAsync(projectId);
        var next = values.AutoComplete ?? globalAutoComplete;

        if (current.AutoCompleteParents.Value || !next)
        {
            return true;
        }

        var preview = await settings.PreviewProjectAutoCompleteAsync(projectId);

        if (preview.ParentsToComplete + preview.ParentsToReopen == 0)
        {
            return true;
        }

        var message = $"Turning this on will complete {preview.ParentsToComplete} parents and reopen {preview.ParentsToReopen} parents. Continue?";

        return await dialogs.ConfirmAsync("Turn on auto-complete", message);
    }

    private async Task BackAsync()
    {
        if (IsDirty && !await dialogs.ConfirmAsync("Discard unsaved settings?",
            "Your changes to this project's settings haven't been saved.", "Discard"))
        {
            return;
        }

        await navigation.OpenProjectAsync(projectId);
    }

    private void Validate()
    {
        Error = YellowDays < 0 || RedHours < 0 || TimeSpan.FromHours(RedHours) > TimeSpan.FromDays(YellowDays)
            ? "Red threshold must be no greater than yellow."
            : null;
        OnPropertyChanged(nameof(IsDirty));
        OnPropertyChanged(nameof(CanSave));
    }

    private static string SourceText(bool isOverridden)
    {
        return isOverridden ? "Project override" : "Inherited from global";
    }

    private readonly record struct Overrides(bool? AutoComplete, TimeSpan? Yellow, TimeSpan? Red);
}