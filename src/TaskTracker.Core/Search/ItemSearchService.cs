using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Search;

/// <summary>Validates and executes item searches.</summary>
public sealed class ItemSearchService(IUnitOfWorkFactory factory, ItemQueryValidator validator) : IItemSearchService
{
    public async Task<ItemSearchResults> SearchAsync(
        ItemQuery query, int limit = 200, CancellationToken cancellationToken = default)
    {
        if (limit < 1)
        {
            throw new DomainRuleException("Search limit must be positive.");
        }

        await using var unit = factory.Begin();
        var fields = await validator.ValidateAsync(query, unit, cancellationToken);
        return await unit.Search.SearchAsync(query, fields, limit, cancellationToken);
    }
}