using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Checks the custom field definitions and choices of an import document (§7.1).</summary>
internal sealed class FieldDocumentValidator(ImportIndex index, IssueList issues)
{
    private readonly HashSet<Guid> fieldIds = [];
    private readonly HashSet<Guid> choiceIds = [];
    private readonly HashSet<string> keys = new(StringComparer.OrdinalIgnoreCase);

    public void Validate(IReadOnlyList<FieldDocument>? fields)
    {
        var list = fields.OrEmpty();

        for (var position = 0; position < list.Count; position++)
        {
            ValidateField(list[position], ImportChecks.Element("$.fields", position));
        }

        CheckActiveNames(list);
    }

    private void ValidateField(FieldDocument field, string path)
    {
        ImportChecks.CheckId(field.Id, $"{path}.id", fieldIds, issues);
        CheckKey(field.Key, $"{path}.key");
        ImportChecks.CheckName(field.DisplayName, FieldDefinition.NameMaxLength, $"{path}.displayName", issues);
        CheckProject(field.ProjectId, $"{path}.projectId");
        var isChoiceField = CheckDataType(field.DataType, $"{path}.dataType");
        ValidateChoices(field, isChoiceField, path);
    }

    private void CheckKey(string? key, string path)
    {
        if (ImportChecks.CheckName(key, FieldDefinition.KeyMaxLength, path, issues) && !keys.Add(key!.Trim()))
        {
            issues.Add(path, $"The key '{key.Trim()}' is used more than once.");
        }
    }

    private void CheckProject(Guid? projectId, string path)
    {
        if (projectId is Guid id && !index.ProjectIds.Contains(id))
        {
            issues.Add(path, $"The project {id} is not in this file.");
        }
    }

    /// <summary>Checks the data type name and returns true when it names the Choice type.</summary>
    private bool CheckDataType(string? dataType, string path)
    {
        if (!ImportChecks.TryParseDataType(dataType, out var type))
        {
            var allowed = string.Join(", ", Enum.GetNames<FieldDataType>());
            issues.Add(path, $"The data type must be one of: {allowed}.");
            return false;
        }

        return type == FieldDataType.Choice;
    }

    private void ValidateChoices(FieldDocument field, bool isChoiceField, string path)
    {
        var choices = field.Choices.OrEmpty();

        if (!isChoiceField && choices.Count > 0)
        {
            issues.Add($"{path}.choices", "Only a Choice field can have choices.");
            return;
        }

        var activeLabels = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var position = 0; position < choices.Count; position++)
        {
            ValidateChoice(choices[position], ImportChecks.Element($"{path}.choices", position), activeLabels);
        }
    }

    private void ValidateChoice(ChoiceDocument choice, string path, HashSet<string> activeLabels)
    {
        ImportChecks.CheckId(choice.Id, $"{path}.id", choiceIds, issues);
        var labelIsValid = ImportChecks.CheckName(choice.Label, FieldChoice.LabelMaxLength, $"{path}.label", issues);

        if (labelIsValid && choice.IsArchived != true && !activeLabels.Add(choice.Label!.Trim()))
        {
            issues.Add($"{path}.label", $"The label '{choice.Label.Trim()}' is used by more than one active choice.");
        }
    }

    /// <summary>Active field names must be unique among the fields visible together (global plus one project).</summary>
    private void CheckActiveNames(IReadOnlyList<FieldDocument> fields)
    {
        var globalNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var projectNames = new HashSet<(Guid ProjectId, string Name)>();

        for (var position = 0; position < fields.Count; position++)
        {
            if (fields[position].ProjectId is null)
            {
                CheckGlobalName(fields[position], position, globalNames);
            }
        }

        for (var position = 0; position < fields.Count; position++)
        {
            if (fields[position].ProjectId is Guid projectId)
            {
                CheckProjectName(fields[position], projectId, position, globalNames, projectNames);
            }
        }
    }

    private void CheckGlobalName(FieldDocument field, int position, HashSet<string> globalNames)
    {
        var name = ActiveName(field);

        if (name is not null && !globalNames.Add(name))
        {
            AddNameClash(position, name);
        }
    }

    private void CheckProjectName(FieldDocument field, Guid projectId, int position,
        HashSet<string> globalNames, HashSet<(Guid ProjectId, string Name)> projectNames)
    {
        var name = ActiveName(field);

        if (name is null)
        {
            return;
        }

        var clashesWithGlobal = globalNames.Contains(name);
        var clashesWithProject = !projectNames.Add((projectId, name.ToUpperInvariant()));

        if (clashesWithGlobal || clashesWithProject)
        {
            AddNameClash(position, name);
        }
    }

    private static string? ActiveName(FieldDocument field)
    {
        var name = field.DisplayName?.Trim();

        return field.IsArchived == true || string.IsNullOrEmpty(name) ? null : name;
    }

    private void AddNameClash(int position, string name)
    {
        var path = $"{ImportChecks.Element("$.fields", position)}.displayName";
        issues.Add(path, $"The name '{name}' is already used by another active field.");
    }
}