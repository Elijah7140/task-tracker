namespace TaskTracker.Core.Items;

/// <summary>A web or mail link attached to an item, shown in the editor's Links section (§7.10).</summary>
public sealed class ItemLink
{
    private ItemLink()
    {
    }

    public Guid Id { get; private set; }

    public Guid ItemId { get; private set; }

    /// <summary>An absolute http, https or mailto address, trimmed and at most <see cref="LinkPolicy.UrlMaxLength"/> characters.</summary>
    public string Url { get; private set; } = string.Empty;

    /// <summary>An optional label shown instead of the address.</summary>
    public string? Title { get; private set; }

    /// <summary>The position among the item's links; the list is always numbered 0, 1, 2...</summary>
    public int SortOrder { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>Creates a link from input that has already passed <see cref="LinkPolicy.Validate"/>.</summary>
    public static ItemLink Create(Guid itemId, ItemLinkInput input, int sortOrder, TimeProvider clock)
    {
        return new ItemLink
        {
            Id = Guid.CreateVersion7(),
            ItemId = itemId,
            Url = LinkPolicy.NormalizeUrl(input.Url),
            Title = LinkPolicy.NormalizeTitle(input.Title),
            SortOrder = sortOrder,
            CreatedAtUtc = clock.GetUtcNow().UtcDateTime
        };
    }

    /// <summary>Replaces the address and title with input that has already passed <see cref="LinkPolicy.Validate"/>.</summary>
    public void Replace(ItemLinkInput input)
    {
        Url = LinkPolicy.NormalizeUrl(input.Url);
        Title = LinkPolicy.NormalizeTitle(input.Title);
    }

    public void SetSortOrder(int sortOrder)
    {
        SortOrder = sortOrder;
    }

    /// <summary>Gives an imported link its original creation time.</summary>
    public void RestoreCreatedAt(DateTime createdAtUtc)
    {
        CreatedAtUtc = createdAtUtc;
    }
}