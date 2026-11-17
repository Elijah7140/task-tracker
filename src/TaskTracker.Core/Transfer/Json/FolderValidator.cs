using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Checks one project's folders: names, parents in the same project, no cycles (§5.1).</summary>
internal sealed class FolderValidator(IssueList issues, HashSet<Guid> seenFolderIds)
{
    public void Validate(IReadOnlyList<FolderDocument> folders, string path)
    {
        var byId = folders.Where(folder => folder.Id is not null)
            .GroupBy(folder => folder.Id!.Value)
            .ToDictionary(group => group.Key, group => group.First());

        for (var position = 0; position < folders.Count; position++)
        {
            var folderPath = ImportChecks.Element(path, position);
            ValidateFolder(folders[position], folderPath, byId);
        }
    }

    private void ValidateFolder(FolderDocument folder, string path, Dictionary<Guid, FolderDocument> byId)
    {
        ImportChecks.CheckId(folder.Id, $"{path}.id", seenFolderIds, issues);
        ImportChecks.CheckName(folder.Name, Folder.NameMaxLength, $"{path}.name", issues);
        CheckTimestamps(folder, path);

        if (folder.ParentFolderId is Guid parentId)
        {
            CheckParent(folder, parentId, path, byId);
        }
    }

    private void CheckParent(FolderDocument folder, Guid parentId, string path, Dictionary<Guid, FolderDocument> byId)
    {
        if (!byId.ContainsKey(parentId))
        {
            issues.Add($"{path}.parentFolderId", $"The parent folder {parentId} is not in this project.");
        }
        else if (ImportCycles.FormsCycle(folder, byId, other => other.Id, other => other.ParentFolderId))
        {
            issues.Add($"{path}.parentFolderId", "The folder would be inside itself.");
        }
    }

    private void CheckTimestamps(FolderDocument folder, string path)
    {
        TimestampChecks.Check(folder.CreatedAtUtc, $"{path}.createdAtUtc", issues);
        TimestampChecks.Check(folder.UpdatedAtUtc, $"{path}.updatedAtUtc", issues);
    }
}