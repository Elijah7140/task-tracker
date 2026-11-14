using TaskTracker.Core.Fields;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// One field in the field manager. Picking another type in the row's type list tells the
/// manager through <c>typeChanged</c>; the manager then asks the service to apply it.
/// </summary>
public sealed class FieldRowViewModel : ViewModelBase
{
    private readonly Action<FieldRowViewModel> typeChanged;
    private FieldDataType selectedType;

    public FieldRowViewModel(FieldDefinition field, bool canMoveUp, bool canMoveDown,
        FieldChoicesViewModel? choices, Action<FieldRowViewModel> typeChanged)
    {
        this.typeChanged = typeChanged;
        Id = field.Id;
        Name = field.DisplayName;
        IsArchived = field.IsArchived;
        selectedType = field.DataType;
        CanMoveUp = canMoveUp;
        CanMoveDown = canMoveDown;
        Choices = choices;
    }

    public Guid Id { get; }

    public string Name { get; }

    public bool IsArchived { get; }

    public bool CanMoveUp { get; }

    public bool CanMoveDown { get; }

    public IReadOnlyList<FieldDataType> Types { get; } = Enum.GetValues<FieldDataType>();

    /// <summary>The type shown in the row; changing it asks the manager to save the new type.</summary>
    public FieldDataType SelectedType
    {
        get => selectedType;
        set
        {
            if (SetProperty(ref selectedType, value))
            {
                typeChanged(this);
            }
        }
    }

    /// <summary>The choices panel of a saved choice field; null for every other type.</summary>
    public FieldChoicesViewModel? Choices { get; }

    public bool IsChoice
    {
        get { return Choices is not null; }
    }
}