using TaskTracker.Core.Search;

namespace TaskTracker.Core.SavedSearches;

/// <summary>What a saved search remembers: stable query text, scope and the include-completed switch.</summary>
/// <param name="QueryText">Query text in stable form: choices as <c>#id</c>, dates as typed.</param>
/// <param name="Scope">The projects and area to search.</param>
/// <param name="IncludeCompleted">Whether completed items are searched.</param>
public sealed record SavedSearchDefinition(string QueryText, SearchScope Scope, bool IncludeCompleted);