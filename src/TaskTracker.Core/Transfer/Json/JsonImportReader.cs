using System.Text.Json;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Parses import text, rejects other formats and future versions, then validates the content.</summary>
internal static class JsonImportReader
{
    private const char ByteOrderMark = (char)0xFEFF;

    public static JsonImportCheck Read(string text)
    {
        var trimmed = text.TrimStart(ByteOrderMark);
        var headerIssues = CheckHeader(trimmed);

        if (headerIssues.Count > 0)
        {
            return Failed(headerIssues);
        }

        return ReadDocument(trimmed);
    }

    private static JsonImportCheck ReadDocument(string text)
    {
        try
        {
            var document = ExportJson.Deserialize(text);

            return document is null
                ? Failed([new TransferIssue("$", "The file is empty.")])
                : Validated(document);
        }
        catch (JsonException exception)
        {
            return Failed([DescribeJsonProblem(exception)]);
        }
    }

    private static JsonImportCheck Validated(ExportDocument document)
    {
        var nullElements = NullElementChecker.Find(document);

        if (nullElements.Count > 0)
        {
            return new JsonImportCheck(null, nullElements, TransferSummary.Empty);
        }

        var issues = ImportDocumentValidator.Validate(document);

        return new JsonImportCheck(document, issues, Summarize(document));
    }

    private static List<TransferIssue> CheckHeader(string text)
    {
        try
        {
            using var parsed = JsonDocument.Parse(text, ExportJson.DocumentOptions);

            return HeaderIssues(parsed.RootElement);
        }
        catch (JsonException exception)
        {
            return [DescribeJsonProblem(exception)];
        }
    }

    private static List<TransferIssue> HeaderIssues(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object)
        {
            return [new TransferIssue("$", "The file must contain one JSON object.")];
        }

        var issues = new List<TransferIssue>();
        CheckFormat(root, issues);

        if (issues.Count == 0)
        {
            CheckVersion(root, issues);
        }

        return issues;
    }

    private static void CheckFormat(JsonElement root, List<TransferIssue> issues)
    {
        var format = FindProperty(root, "format");
        var isTaskTracker = format is { ValueKind: JsonValueKind.String }
            && format.Value.GetString() == ExportDocument.FormatName;

        if (!isTaskTracker)
        {
            issues.Add(new TransferIssue("$.format",
                $"This is not a Task Tracker export; 'format' must be \"{ExportDocument.FormatName}\"."));
        }
    }

    private static void CheckVersion(JsonElement root, List<TransferIssue> issues)
    {
        var version = FindProperty(root, "version");

        if (version is not { ValueKind: JsonValueKind.Number } || !version.Value.TryGetInt32(out var number))
        {
            issues.Add(new TransferIssue("$.version", "The version must be a whole number."));
        }
        else if (number > ExportDocument.CurrentVersion)
        {
            issues.Add(new TransferIssue("$.version",
                $"This file was written by a newer version of Task Tracker (file version {number}; " +
                $"this version reads version {ExportDocument.CurrentVersion}). Update the application to import it."));
        }
        else if (number < ExportDocument.CurrentVersion)
        {
            issues.Add(new TransferIssue("$.version", $"File version {number} is not supported."));
        }
    }

    private static JsonElement? FindProperty(JsonElement root, string name)
    {
        foreach (var property in root.EnumerateObject())
        {
            if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                return property.Value;
            }
        }

        return null;
    }

    private static TransferIssue DescribeJsonProblem(JsonException exception)
    {
        var message = exception.Message;
        var detailStart = message.IndexOf(" Path:", StringComparison.Ordinal);
        var summary = detailStart < 0 ? message : message[..detailStart];

        return new TransferIssue(exception.Path ?? "$", summary.Trim());
    }

    private static JsonImportCheck Failed(IReadOnlyList<TransferIssue> issues)
    {
        return new JsonImportCheck(null, issues, TransferSummary.Empty);
    }

    private static TransferSummary Summarize(ExportDocument document)
    {
        var projects = document.Projects.OrEmpty();
        var folders = projects.Sum(project => project.Folders.OrEmpty().Count);
        var items = projects.Sum(project => project.Items.OrEmpty().Count);

        return new TransferSummary(projects.Count, folders, items, document.SavedSearches.OrEmpty().Count);
    }
}