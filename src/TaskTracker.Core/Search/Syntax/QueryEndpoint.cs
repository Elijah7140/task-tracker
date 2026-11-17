namespace TaskTracker.Core.Search.Syntax;

/// <summary>One value written after an operator; a range has two.</summary>
/// <param name="Value">The text with quotes removed and escapes resolved.</param>
/// <param name="Quoted">True when the value was written inside quotes.</param>
internal sealed record QueryEndpoint(string Value, bool Quoted);