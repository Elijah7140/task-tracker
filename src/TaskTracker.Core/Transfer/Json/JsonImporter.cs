using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Tickets;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// Adds the contents of a validated import document to a unit of work as new rows. The caller
/// saves the unit of work, so a document that fails halfway changes nothing.
/// </summary>
internal sealed class JsonImporter(TimeProvider clock)
{
    /// <summary>
    /// Adds the lookups, fields, projects, folders, items, values and saved searches. Problems that
    /// depend on the database (a field key clashing in type, settings that would be invalid here)
    /// are added to <paramref name="issues"/>; the caller must then discard the unit of work.
    /// </summary>
    public async Task<TransferSummary> PlanAsync(
        IUnitOfWork work, ExportDocument document, IssueList issues, CancellationToken cancellationToken)
    {
        var index = new ImportIndex(document);
        var map = new ImportMap();

        await LookupImporter.ImportAsync(work, document, map, issues, cancellationToken);
        var projects = await new ProjectImporter(work, clock, map, issues).CreateAsync(document, cancellationToken);
        await new FieldImporter(work, map, issues).ImportAsync(document, cancellationToken);

        if (issues.Count > 0)
        {
            return TransferSummary.Empty;
        }

        var content = new ProjectContentImporter(work, clock, index, map);
        var folderCount = 0;
        var added = new List<TodoItem>();

        foreach (var project in projects)
        {
            var (folders, items) = content.Import(project);
            folderCount += folders;
            added.AddRange(items);
        }

        var searchCount = await new SavedSearchImporter(work, clock, map, issues).ImportAsync(document, cancellationToken);
        if (issues.Count == 0)
        {
            await TicketRanks.AppendNewAsync(work, added, cancellationToken);
        }

        return new TransferSummary(projects.Count, folderCount, added.Count, searchCount);
    }
}