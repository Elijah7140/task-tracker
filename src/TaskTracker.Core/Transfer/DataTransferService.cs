using TaskTracker.Core.Fields;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Search;
using TaskTracker.Core.Transfer.Csv;
using TaskTracker.Core.Transfer.Json;

namespace TaskTracker.Core.Transfer;

/// <summary>
/// Exports data as JSON or CSV and imports it again (§7.9). Each public operation is one unit of
/// work. Imports add new data and may assign ranks to legacy tickets in affected sections.
/// They validate the whole file first, take a database backup
/// just before writing, and save once, so a bad file changes nothing. Imports are not undoable.
/// </summary>
public sealed class DataTransferService(
    IUnitOfWorkFactory unitOfWorkFactory,
    TimeProvider clock,
    IDatabaseBackup backup,
    FieldWriteGate? writeGate = null)
{
    private readonly FieldWriteGate gate = writeGate ?? FieldWriteGate.Shared;

    /// <summary>Writes the whole database or one project as a versioned JSON document.</summary>
    public async Task<string> ExportJsonAsync(TransferScope scope, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        var document = await new ExportDocumentBuilder(clock).BuildAsync(work, scope, cancellationToken);

        return ExportJson.Serialize(document);
    }

    /// <summary>Reads and validates JSON import text without changing anything.</summary>
    public JsonImportCheck CheckJson(string text)
    {
        return JsonImportReader.Read(text);
    }

    /// <summary>
    /// Imports JSON text as new data in one save. Returns the issues instead when the file is
    /// invalid or does not fit this database; then nothing was changed.
    /// </summary>
    public async Task<TransferResult> ImportJsonAsync(string text, CancellationToken cancellationToken = default)
    {
        var check = JsonImportReader.Read(text);

        if (!check.IsValid)
        {
            return TransferResult.Failure(check.Issues);
        }

        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var issues = new IssueList();
        var summary = await PlanJsonImportAsync(work, check.Document!, issues, cancellationToken);

        if (issues.Count > 0)
        {
            return TransferResult.Failure(issues.Items);
        }

        return await SaveWithBackupAsync(work, summary, cancellationToken);
    }

    /// <summary>Writes every active item of a project as CSV text.</summary>
    public async Task<string> ExportProjectCsvAsync(Guid projectId, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        var scope = new TransferScope.SingleProject(projectId);
        var projects = await ProjectExportLoader.LoadAsync(work, scope, cancellationToken);
        var catalogue = await ExportCatalogue.LoadAsync(work, cancellationToken);

        return new CsvExporter(catalogue).Export(projects, null);
    }

    /// <summary>Writes the given search results as CSV text, in result order; items deleted since are left out.</summary>
    public async Task<string> ExportResultsCsvAsync(
        IReadOnlyList<ItemSearchResult> results, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        var projectIds = results.Select(result => result.ProjectId);
        var projects = await ProjectExportLoader.LoadActiveAsync(work, projectIds, cancellationToken);
        var catalogue = await ExportCatalogue.LoadAsync(work, cancellationToken);

        return new CsvExporter(catalogue).Export(projects, results.Select(result => result.ItemId).ToList());
    }

    /// <summary>
    /// Reads CSV text against a project (and optionally one of its folders) without changing anything.
    /// Throws <see cref="DomainRuleException"/> when the project or folder is missing or deleted.
    /// </summary>
    public async Task<CsvImportPreview> PreviewCsvAsync(
        string text, Guid projectId, Guid? folderId, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        var context = await CsvImportContext.LoadAsync(work, projectId, folderId, cancellationToken);

        return CsvImportPlanner.Plan(text, context, clock).Preview;
    }

    /// <summary>
    /// Imports CSV rows as new top-level items at the end of the project root or folder, in one
    /// save. Returns the issues instead when any row is invalid; then nothing was changed.
    /// </summary>
    public async Task<TransferResult> ImportCsvAsync(
        string text, Guid projectId, Guid? folderId, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var context = await CsvImportContext.LoadAsync(work, projectId, folderId, cancellationToken);
        var plan = CsvImportPlanner.Plan(text, context, clock);

        if (!plan.Preview.CanImport)
        {
            return TransferResult.Failure(plan.Preview.Issues);
        }

        await CsvItemImporter.AddItemsAsync(work, plan.Rows, projectId, folderId, clock, cancellationToken);
        var summary = new TransferSummary(0, 0, plan.Rows.Count, 0);

        return await SaveWithBackupAsync(work, summary, cancellationToken);
    }

    private async Task<TransferSummary> PlanJsonImportAsync(
        IUnitOfWork work, ExportDocument document, IssueList issues, CancellationToken cancellationToken)
    {
        try
        {
            return await new JsonImporter(clock).PlanAsync(work, document, issues, cancellationToken);
        }
        catch (Exception exception) when (exception is DomainRuleException or ArgumentException)
        {
            issues.Add("$", exception.Message);
            return TransferSummary.Empty;
        }
    }

    private async Task<TransferResult> SaveWithBackupAsync(
        IUnitOfWork work, TransferSummary summary, CancellationToken cancellationToken)
    {
        var backupPath = CreateBackupOrFail();
        await work.SaveChangesAsync(cancellationToken);

        return TransferResult.Success(summary, backupPath);
    }

    /// <summary>A backup that cannot be taken stops the import before anything is saved.</summary>
    private string CreateBackupOrFail()
    {
        try
        {
            return backup.CreateBackup();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            throw new IOException($"The database backup could not be made, so nothing was imported: {exception.Message}", exception);
        }
    }
}