namespace TaskTracker.Core.Search;

/// <summary>An operation applied to one search field.</summary>
public enum FilterOperator
{
    Equals,
    NotEquals,
    GreaterThan,
    LessThan,
    Between,
    Contains,
    IsEmpty,
    IsNotEmpty
}