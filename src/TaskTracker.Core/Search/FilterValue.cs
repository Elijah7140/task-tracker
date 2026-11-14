namespace TaskTracker.Core.Search;

/// <summary>A typed value supplied to a field filter.</summary>
public abstract record FilterValue
{
    /// <summary>A text value.</summary>
    public sealed record Text(string Value) : FilterValue;

    /// <summary>A finite numeric value.</summary>
    public sealed record Number(double Value) : FilterValue;

    /// <summary>A calendar date.</summary>
    public sealed record Date(DateOnly Value) : FilterValue;

    /// <summary>A Boolean value.</summary>
    public sealed record Bool(bool Value) : FilterValue;

    /// <summary>A stable choice identifier.</summary>
    public sealed record Choice(Guid Id) : FilterValue;

    /// <summary>An inclusive interval between two ranked choices.</summary>
    public sealed record ChoiceRange(Guid Min, Guid Max) : FilterValue;

    /// <summary>An inclusive numeric interval.</summary>
    public sealed record NumberRange(double Min, double Max) : FilterValue;

    /// <summary>An inclusive date interval.</summary>
    public sealed record DateRange(DateOnly Min, DateOnly Max) : FilterValue;
}