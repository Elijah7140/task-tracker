using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Remembers which new or matched row each id or key in the import file turned into.</summary>
internal sealed class ImportMap
{
    public Dictionary<Guid, Guid> ItemTypes { get; } = [];

    public Dictionary<Guid, Guid> PriorityLevels { get; } = [];

    public Dictionary<Guid, Guid> Choices { get; } = [];

    public Dictionary<Guid, Guid> Projects { get; } = [];

    public Dictionary<Guid, Guid> Folders { get; } = [];

    public Dictionary<string, FieldDefinition> Fields { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Every id that a saved search's query text can mention, mapped to its new id.</summary>
    public IEnumerable<KeyValuePair<Guid, Guid>> QueryIds => ItemTypes.Concat(PriorityLevels).Concat(Choices);
}