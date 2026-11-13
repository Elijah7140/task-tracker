namespace TaskTracker.Presentation.ViewModels;

/// <summary>One picker entry, including the explicit absence of a lookup value.</summary>
public sealed record LookupOption<T>(string Name, T? Value) where T : class;