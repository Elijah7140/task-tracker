namespace TaskTracker.Core.Search;

/// <summary>Lists visible fields and their selectable choices.</summary>
public interface IFieldRegistry
{
    Task<IReadOnlyList<SearchableField>> GetFieldsAsync(SearchScope scope, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SearchChoice>> GetChoicesAsync(SearchableField field, CancellationToken cancellationToken = default);
}