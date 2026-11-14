namespace TaskTracker.Presentation.ViewModels;

/// <summary>One entry of a choice picker; a null <see cref="Id"/> is the "(none)" entry.</summary>
public sealed record ChoiceOption(string Label, Guid? Id)
{
    public override string ToString()
    {
        return Label;
    }
}