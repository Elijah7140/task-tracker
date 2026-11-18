using System.Globalization;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.CurrentItem;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>The small card the tray icon shows for the current item (§7.17).</summary>
public sealed class CurrentItemCardViewModel : ViewModelBase
{
    private readonly Func<Task<CurrentItemCard?>> loadCard;
    private readonly Func<Guid, Task> openItem;
    private CurrentItemCard? card;

    /// <param name="loadCard">Reads the current item's card, or null when there is none.</param>
    /// <param name="openItem">Shows the main window with the item selected.</param>
    public CurrentItemCardViewModel(Func<Task<CurrentItemCard?>> loadCard, Func<Guid, Task> openItem)
    {
        this.loadCard = loadCard;
        this.openItem = openItem;
        OpenCommand = new AsyncRelayCommand(OpenAsync, () => HasItem);
    }

    /// <summary>Raised after Open, so the view can close the card.</summary>
    public event Action? OpenRequested;

    public bool HasItem => card is not null;

    public bool IsEmpty => card is null;

    public string Title => card?.Title ?? string.Empty;

    public string AreaPath => card?.AreaPath ?? string.Empty;

    public string? StatusName => card?.StatusName;

    public bool HasStatus => StatusName is not null;

    public string? PriorityName => card?.PriorityName;

    public bool HasPriority => PriorityName is not null;

    public string? DueText => card is null ? null : DescribeDue(card.DueDate, card.DueTime);

    public bool HasDue => DueText is not null;

    public string? Description => string.IsNullOrWhiteSpace(card?.Description) ? null : card.Description.Trim();

    public bool HasDescription => Description is not null;

    public bool IsCompleted => card?.IsCompleted == true;

    /// <summary>Shows the main window with the item selected.</summary>
    public ICommand OpenCommand { get; }

    /// <summary>Reads the current item again, since it may have changed while the card was hidden.</summary>
    public async Task LoadAsync()
    {
        card = await loadCard();
        OnPropertyChanged(string.Empty);
        ((AsyncRelayCommand)OpenCommand).NotifyCanExecuteChanged();
    }

    private async Task OpenAsync()
    {
        if (card is null)
        {
            return;
        }

        OpenRequested?.Invoke();
        await openItem(card.Id);
    }

    private static string? DescribeDue(DateOnly? date, TimeOnly? time)
    {
        if (date is not DateOnly dueDate)
        {
            return null;
        }

        var culture = CultureInfo.CurrentCulture;
        var text = "Due " + dueDate.ToString("ddd d MMM yyyy", culture);

        return time is TimeOnly dueTime ? $"{text}, {dueTime.ToString("t", culture)}" : text;
    }
}