using TaskTracker.Core.Search;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>An operator with a label suited to its field.</summary>
public sealed record SearchOperatorOption(FilterOperator Operator, string Label);