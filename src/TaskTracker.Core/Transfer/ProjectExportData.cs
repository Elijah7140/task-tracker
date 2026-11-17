using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Transfer;

/// <summary>The active rows of one project, loaded once and shared by the JSON and CSV exporters.</summary>
internal sealed record ProjectExportData(
    Project Project,
    IReadOnlyList<Folder> Folders,
    IReadOnlyList<TodoItem> Items,
    IReadOnlyList<ItemFieldValue> Values,
    IReadOnlyDictionary<string, string> Settings);