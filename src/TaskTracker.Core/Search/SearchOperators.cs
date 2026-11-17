using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Search;

/// <summary>Defines the operators available for each searchable field.</summary>
public static class SearchOperators
{
    /// <summary>Returns the valid operators in display order.</summary>
    public static IReadOnlyList<FilterOperator> For(SearchableField field)
    {
        if (field.IsBuiltIn && field.Key == "link")
        {
            return [FilterOperator.Contains, FilterOperator.IsEmpty, FilterOperator.IsNotEmpty];
        }

        if (field.IsBuiltIn && field.Key == "reminder")
        {
            return [FilterOperator.IsNotEmpty, FilterOperator.IsEmpty];
        }

        var operators = new List<FilterOperator> { FilterOperator.Equals, FilterOperator.NotEquals };

        if (field.DataType == FieldDataType.Text)
        {
            operators.Add(FilterOperator.Contains);
        }

        if (SupportsOrderedComparison(field))
        {
            operators.Add(FilterOperator.GreaterThan);
            operators.Add(FilterOperator.LessThan);
            operators.Add(FilterOperator.Between);
        }

        operators.Add(FilterOperator.IsEmpty);
        operators.Add(FilterOperator.IsNotEmpty);
        return operators;
    }

    private static bool SupportsOrderedComparison(SearchableField field)
    {
        var isNumberOrDate = field.DataType is FieldDataType.Number or FieldDataType.Date;
        var isPriority = field.IsBuiltIn && field.Key == "priority";
        return isNumberOrDate || isPriority;
    }
}