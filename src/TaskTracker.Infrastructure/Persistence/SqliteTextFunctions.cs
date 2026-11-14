namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Functions translated to SQLite for Unicode-aware text comparisons.</summary>
public static class SqliteTextFunctions
{
    public static string? Fold(string? value)
    {
        throw new NotSupportedException("This function is evaluated by SQLite.");
    }
}