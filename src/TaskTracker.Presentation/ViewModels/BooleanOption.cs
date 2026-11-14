namespace TaskTracker.Presentation.ViewModels;

/// <summary>One entry of a Yes/No picker; a null <see cref="Value"/> is the "(none)" entry.</summary>
public sealed record BooleanOption(string Label, bool? Value)
{
    public override string ToString()
    {
        return Label;
    }
}