using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Settings;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Edits global completion and urgency defaults. The defaults save together with the Save button;
/// the lookup lists on the same page save immediately.
/// </summary>
public sealed class AppSettingsViewModel : ViewModelBase, IUnsavedChangesGuard
{
    private readonly SettingsService settings;
    private readonly IDialogService dialogs;
    private readonly INavigationService navigation;
    private readonly Guid? returnProjectId;
    private bool autoCompleteParents;
    private double yellowAmount;
    private double redAmount;
    private string yellowUnit = "days";
    private string redUnit = "hours";
    private string? error;
    private GlobalDefaults saved;

    public AppSettingsViewModel(SettingsService settings, IDialogService dialogs,
        INavigationService navigation, LookupService? lookups = null, Guid? returnProjectId = null,
        FieldService? fields = null)
    {
        this.settings = settings;
        this.dialogs = dialogs;
        this.navigation = navigation;
        this.returnProjectId = returnProjectId;

        if (lookups is not null)
        {
            ItemTypes = new LookupListViewModel(lookups, dialogs, true);
            PriorityLevels = new LookupListViewModel(lookups, dialogs, false);
        }

        if (fields is not null)
        {
            CustomFields = new FieldManagerViewModel(fields, dialogs, null);
        }

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

    public FieldManagerViewModel? CustomFields { get; }

    public ICommand SaveCommand { get; }

    public ICommand BackCommand { get; }

    public async Task LoadAsync()
    {
        AutoCompleteParents = await settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents);
        YellowAmount = (await settings.GetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold)).TotalDays;
        RedAmount = (await settings.GetGlobalAsync(SettingsCatalogue.UrgencyRedThreshold)).TotalHours;
        YellowUnit = "days";
        RedUnit = "hours";
        saved = CurrentDefaults();
        Validate();

        if (ItemTypes is not null)
        {
            await ItemTypes.LoadAsync();
        }

        if (PriorityLevels is not null)
        {
            await PriorityLevels.LoadAsync();
        }

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
                var defaults = CurrentDefaults();
                await settings.SaveGlobalAsync(defaults.AutoCompleteParents, defaults.Yellow, defaults.Red, confirmed: true);
                saved = defaults;
                Validate();
            }
        }
        catch (DomainRuleException exception)
        {
            Error = exception.Message;
            OnPropertyChanged(nameof(CanSave));
        }
    }

    private GlobalDefaults CurrentDefaults()
    {
        return new GlobalDefaults(AutoCompleteParents, Duration(YellowAmount, YellowUnit), Duration(RedAmount, RedUnit));
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
            : null;
        OnPropertyChanged(nameof(IsDirty));
        OnPropertyChanged(nameof(CanSave));
    }

    private static TimeSpan Duration(double amount, string unit)
    {
        return unit == "days" ? TimeSpan.FromDays(amount) : TimeSpan.FromHours(amount);
    }

    private readonly record struct GlobalDefaults(bool AutoCompleteParents, TimeSpan Yellow, TimeSpan Red);
}