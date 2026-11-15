namespace TaskTracker.Core.Search.Syntax;

/// <summary>A value read from query text: the typed value with its stable and display spellings, or an error message.</summary>
/// <param name="Value">The typed value; null when reading failed.</param>
/// <param name="Stable">How the value is written in stable text (choices as <c>#id</c>).</param>
/// <param name="Display">How the value is shown to users: choices by label, everything else as typed.</param>
/// <param name="Error">What is wrong with the value; null on success.</param>
internal sealed record ValueOutcome(FilterValue? Value, string Stable, string Display, string? Error)
{
    public static ValueOutcome Ok(FilterValue value, string stable, string? display = null)
    {
        return new ValueOutcome(value, stable, display ?? stable, null);
    }

    public static ValueOutcome Fail(string message)
    {
        return new ValueOutcome(null, string.Empty, string.Empty, message);
    }
}