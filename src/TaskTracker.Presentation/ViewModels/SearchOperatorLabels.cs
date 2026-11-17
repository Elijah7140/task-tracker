using TaskTracker.Core.Fields;
using TaskTracker.Core.Search;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Wording for each filter operator, adapted to the field it applies to.</summary>
internal static class SearchOperatorLabels
{
    public static SearchOperatorOption Option(SearchableField field, FilterOperator operation)
    {
        return new SearchOperatorOption(operation, Label(field, operation));
    }

    private static string Label(SearchableField field, FilterOperator operation)
    {
        var isPriority = field.Key == "priority" && field.IsBuiltIn;
        var isDate = field.DataType == FieldDataType.Date;

        return operation switch
        {
            FilterOperator.Equals => "is",
            FilterOperator.NotEquals => "is not",
            FilterOperator.Contains => "contains",
            FilterOperator.GreaterThan when isPriority => "more important than",
            FilterOperator.LessThan when isPriority => "less important than",
            FilterOperator.GreaterThan when isDate => "after",
            FilterOperator.LessThan when isDate => "before",
            FilterOperator.GreaterThan => "greater than",
            FilterOperator.LessThan => "less than",
            FilterOperator.Between => "between",
            FilterOperator.IsEmpty => "is empty",
            _ => "is not empty"
        };
    }
}