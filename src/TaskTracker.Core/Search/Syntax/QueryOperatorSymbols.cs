namespace TaskTracker.Core.Search.Syntax;

/// <summary>How each filter operator is spelled in the query syntax.</summary>
internal static class QueryOperatorSymbols
{
    /// <summary>The symbol written between key and value; a range uses <c>:</c> with <c>a..b</c>.</summary>
    public static string Symbol(FilterOperator operation)
    {
        return operation switch
        {
            FilterOperator.NotEquals => "!=",
            FilterOperator.GreaterThan => ">",
            FilterOperator.LessThan => "<",
            FilterOperator.Contains => "~",
            _ => ":"
        };
    }

    /// <summary>A short spelling for error messages, or null for operators written as <c>has:</c> and <c>no:</c>.</summary>
    public static string? Describe(FilterOperator operation)
    {
        return operation switch
        {
            FilterOperator.Between => "a..b",
            FilterOperator.IsEmpty or FilterOperator.IsNotEmpty => null,
            _ => Symbol(operation)
        };
    }
}