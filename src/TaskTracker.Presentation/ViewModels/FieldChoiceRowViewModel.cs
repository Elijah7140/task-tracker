using TaskTracker.Core.Fields;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>One choice of a choice field, shown inside the field's expandable panel.</summary>
public sealed class FieldChoiceRowViewModel(FieldChoice choice, bool canMoveUp, bool canMoveDown)
{
    public Guid Id { get; } = choice.Id;

    public Guid FieldId { get; } = choice.FieldDefinitionId;

    public string Label { get; } = choice.Label;

    public bool IsArchived { get; } = choice.IsArchived;

    public bool CanMoveUp { get; } = canMoveUp;

    public bool CanMoveDown { get; } = canMoveDown;
}