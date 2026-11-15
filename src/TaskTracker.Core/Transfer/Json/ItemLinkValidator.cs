using TaskTracker.Core.Items;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Checks the optional links of one item with the same rules as the editor (§7.10).</summary>
internal sealed class ItemLinkValidator(IssueList issues)
{
    public void Validate(IReadOnlyList<ItemLinkDocument>? links, string path)
    {
        var documents = links.OrEmpty();

        if (documents.Count > LinkPolicy.MaxLinksPerItem)
        {
            issues.Add(path, $"An item may have at most {LinkPolicy.MaxLinksPerItem} links.");
            return;
        }

        for (var position = 0; position < documents.Count; position++)
        {
            var problem = LinkPolicy.Validate(documents[position].Url, documents[position].Title);

            if (problem is not null)
            {
                issues.Add(ImportChecks.Element(path, position), problem);
            }
        }
    }
}