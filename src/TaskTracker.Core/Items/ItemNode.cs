using TaskTracker.Core.Urgency;

namespace TaskTracker.Core.Items;

/// <summary>One bindable item with computed state and active children.</summary>
public sealed record ItemNode(
    TodoItem Item,
    TaskTracker.Core.Urgency.Urgency OwnUrgency,
    DisplayedUrgency DisplayedUrgency,
    bool IsFinished,
    IReadOnlyList<ItemNode> Children);