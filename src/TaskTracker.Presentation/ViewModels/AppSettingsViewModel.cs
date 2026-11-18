using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Settings;
using TaskTracker.Presentation.Installation;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Edits global completion and urgency defaults. The defaults save together with the Save button;
/// the lookup lists on the same page save immediately.
/// </summary>
public sealed class AppSettingsViewModel : ViewModelBase, IUnsavedChangesGuard
{
    public const string StartupEntryFailedText =
        "Settings were saved, but the system refused to update the start-with-system entry.";

    private readonly SettingsService settings;
    private readonly IDialogService dialogs;
    private readonly INavigationService navigation;
    private readonly Guid? returnProjectId;
    private readonly IStartupRegistration? startup;
    private bool autoCompleteParents;
    private bool startWithSystem;
    private double yellowAmount;
    private double redAmount;
    private string yellowUnit = "days";
    private string redUnit = "hours";
    private string? error;
    private GlobalDefaults saved;

    public AppSettingsViewModel(SettingsService settings, IDialogService dialogs,
        INavigationService navigation, LookupService? lookups = null, Guid? returnProjectId = null,
        FieldService? fields = null, InstallationServices? installation = null, AppUpdateViewModel? updates = null)
    {
        this.settings = settings;
        this.dialogs = dialogs;
        this.navigation = navigation;
        this.returnProjectId = returnProjectId;
        startup = installation?.Startup;
        About = installation?.Version.AboutText;

        if (installation is not null)
        {
            Updates = updates ?? new AppUpdateViewModel(installation.Updates, ConfirmLeaveAsync);
        }

        if (lookups is not null)
        {
            ItemTypes = new LookupListViewModel(lookups, dialogs, LookupListKind.ItemTypes);
            PriorityLevels = new LookupListViewModel(lookups, dialogs, LookupListKind.PriorityLevels);
            Statuses = new LookupListViewModel(lookups, dialogs, LookupListKind.Statuses);
        }

        if (fields is not null)
        {
            CustomFields = new FieldManagerViewModel(fields, dialogs, null);
        }

        Reminders.PropertyChanged += (_, _) => Validate();
        SaveCommand = new AsyncRelayCommand(SaveAsync);
        BackCommand = new AsyncRelayCommand(BackAsync);
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

    /// <summary>Starts the installed app at sign-in; saved with the other defaults.</summary>
    public bool StartWithSystem
    {
        get => startWithSystem;
        set
        {
            SetProperty(ref startWithSystem, value);
            Validate();
        }
    }

    /// <summary>The option is offered only for an installed app on Windows or Linux.</summary>
    public bool IsStartWithSystemAvailable => startup?.IsAvailable == true;

    /// <summary>The About line with the app version; null when the host supplies no version.</summary>
    public string? About { get; }

    public AppUpdateViewModel? Updates { get; }

    public double YellowAmount
    {
        get => yellowAmount;
        set
        {
            SetProperty(ref yellowAmount, value);
            Validate();
        }
    }

    public double RedAmount
    {
        get => redAmount;
        set
        {
            SetProperty(ref redAmount, value);
            Validate();
        }
    }

    public string YellowUnit
    {
        get => yellowUnit;
        set
        {
            SetProperty(ref yellowUnit, value);
            Validate();
        }
    }

    public string RedUnit
    {
        get => redUnit;
        set
        {
            SetProperty(ref redUnit, value);
            Validate();
        }
    }

    public string? Error
    {
        get => error;
        private set => SetProperty(ref error, value);
    }

    /// <summary>True when the form differs from what was last loaded or saved.</summary>
    public bool IsDirty => CurrentDefaults() != saved;

    public bool CanSave => Error is null && IsDirty;

    public IReadOnlyList<string> DurationUnits { get; } = ["days", "hours"];

    public LookupListViewModel? ItemTypes { get; }

    public LookupListViewModel? PriorityLevels { get; }

    public LookupListViewModel? Statuses { get; }

    /// <summary>Reloads the lookup lists, on opening and after an undo or redo changed one of them.</summary>
    public async Task LoadLookupsAsync()
    {
        foreach (var list in new[] { ItemTypes, PriorityLevels, Statuses })
        {
            if (list is not null)
            {
                await list.LoadAsync();
            }
        }
    }

    public FieldManagerViewModel? CustomFields { get; }

    public ReminderSettingsViewModel Reminders { get; } = new();

    public ICommand SaveCommand { get; }

    public ICommand BackCommand { get; }

    public async Task LoadAsync()
    {
        AutoCompleteParents = await settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents);
        YellowAmount = (await settings.GetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold)).TotalDays;
        RedAmount = (await settings.GetGlobalAsync(SettingsCatalogue.UrgencyRedThreshold)).TotalHours;
        YellowUnit = "days";
        RedUnit = "hours";
        await Reminders.LoadGlobalAsync(settings);
        StartWithSystem = await settings.GetGlobalAsync(SettingsCatalogue.StartWithSystem);
        saved = CurrentDefaults();
        Validate();

        await LoadLookupsAsync();

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
            if (await ConfirmCompletionAsync())
            {
                await SaveConfirmedAsync(CurrentDefaults());
            }
        }
        catch (DomainRuleException exception)
        {
            Error = exception.Message;
            OnPropertyChanged(nameof(CanSave));
        }
    }

    private async Task SaveConfirmedAsync(GlobalDefaults defaults)
    {
        bool? startWithSystemToSave = IsStartWithSystemAvailable ? defaults.StartWithSystem : null;
        await settings.SaveGlobalAsync(defaults.AutoCompleteParents, defaults.Yellow, defaults.Red, confirmed: true,
            reminders: defaults.Reminders, startWithSystem: startWithSystemToSave);
        saved = defaults;
        Validate();

        if (startWithSystemToSave is bool enabled && startup?.TryApply(enabled) == false)
        {
            Error = StartupEntryFailedText;
        }
    }

    private GlobalDefaults CurrentDefaults()
    {
        return new GlobalDefaults(AutoCompleteParents, Duration(YellowAmount, YellowUnit), Duration(RedAmount, RedUnit),
            Reminders.Preferences, StartWithSystem);
    }

    private async Task<bool> ConfirmCompletionAsync()
    {
        var current = await settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents);

        if (current || !AutoCompleteParents)
        {
            return true;
        }

        var preview = await settings.PreviewGlobalAutoCompleteAsync();

        if (preview.ParentsToComplete + preview.ParentsToReopen == 0)
        {
            return true;
        }

        var message = $"Turning this on will complete {preview.ParentsToComplete} parents and reopen {preview.ParentsToReopen} parents. Continue?";

        return await dialogs.ConfirmAsync("Turn on auto-complete", message);
    }

    /// <inheritdoc />
    public async Task<bool> ConfirmLeaveAsync()
    {
        if (!IsDirty)
        {
            return true;
        }

        return await dialogs.ConfirmAsync("Discard unsaved settings?",
            "Your changes to the global defaults haven't been saved.", "Discard");
    }

    private async Task BackAsync()
    {
        if (!await ConfirmLeaveAsync())
        {
            return;
        }

        if (returnProjectId is Guid projectId)
        {
            await navigation.OpenProjectAsync(projectId);
        }
        else
        {
            await navigation.GoHomeAsync();
        }
    }

    private void Validate()
    {
        Error = YellowAmount < 0 || RedAmount < 0 ||
            Duration(RedAmount, RedUnit) > Duration(YellowAmount, YellowUnit)
            ? "Red threshold must be no greater than yellow."
            : Reminders.Error;
        OnPropertyChanged(nameof(IsDirty));
        OnPropertyChanged(nameof(CanSave));
    }

    private static TimeSpan Duration(double amount, string unit)
    {
        return unit == "days" ? TimeSpan.FromDays(amount) : TimeSpan.FromHours(amount);
    }

    private readonly record struct GlobalDefaults(bool AutoCompleteParents, TimeSpan Yellow, TimeSpan Red,
        ReminderPreferences Reminders, bool StartWithSystem);
}