namespace TaskTracker.Presentation.ViewModels;

/// <summary>Builds the custom-field inputs shown in the editor for one item.</summary>
public interface ICustomFieldInputLoader
{
    /// <summary>
    /// Returns an input for every active field that applies to the item, followed by an
    /// input for each archived field that still holds a value on the item.
    /// </summary>
    Task<IReadOnlyList<CustomFieldInputViewModel>> LoadAsync(Guid projectId, Guid itemId);
}