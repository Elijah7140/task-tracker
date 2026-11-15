using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Items;

/// <summary>
/// Replaces the whole link list of one item with the list the editor holds (§7.10): links with a known id are
/// updated or removed, links without one are added, and the order of the list becomes the sort order.
/// </summary>
internal static class ItemLinkEditor
{
    public static async Task ApplyAsync(IItemRepository items, Guid itemId, IReadOnlyList<ItemLinkInput> inputs,
        TimeProvider clock, CancellationToken cancellationToken)
    {
        Validate(inputs);
        var existing = await items.LinksAsync(itemId, cancellationToken);
        RemoveMissing(items, existing, inputs);

        for (var position = 0; position < inputs.Count; position++)
        {
            var current = existing.FirstOrDefault(link => link.Id == inputs[position].Id);
            ApplyOne(items, itemId, current, inputs[position], position, clock);
        }
    }

    private static void Validate(IReadOnlyList<ItemLinkInput> inputs)
    {
        if (inputs.Count > LinkPolicy.MaxLinksPerItem)
        {
            throw new DomainRuleException($"An item may have at most {LinkPolicy.MaxLinksPerItem} links.");
        }

        foreach (var input in inputs)
        {
            var problem = LinkPolicy.Validate(input.Url, input.Title);

            if (problem is not null)
            {
                throw new DomainRuleException(problem);
            }
        }

        CheckIdsAreUnique(inputs);
    }

    private static void CheckIdsAreUnique(IReadOnlyList<ItemLinkInput> inputs)
    {
        var ids = inputs.Where(input => input.Id is not null).Select(input => input.Id).ToList();

        if (ids.Distinct().Count() != ids.Count)
        {
            throw new DomainRuleException("Each link may appear only once.");
        }
    }

    private static void RemoveMissing(IItemRepository items, IReadOnlyList<ItemLink> existing,
        IReadOnlyList<ItemLinkInput> inputs)
    {
        var keptIds = inputs.Where(input => input.Id is not null).Select(input => input.Id!.Value).ToHashSet();

        foreach (var link in existing.Where(link => !keptIds.Contains(link.Id)))
        {
            items.Remove(link);
        }
    }

    private static void ApplyOne(IItemRepository items, Guid itemId, ItemLink? current, ItemLinkInput input,
        int position, TimeProvider clock)
    {
        if (current is null)
        {
            items.Add(ItemLink.Create(itemId, input, position, clock));
            return;
        }

        if (current.Url != LinkPolicy.NormalizeUrl(input.Url) || current.Title != LinkPolicy.NormalizeTitle(input.Title))
        {
            current.Replace(input);
        }

        if (current.SortOrder != position)
        {
            current.SetSortOrder(position);
        }
    }
}