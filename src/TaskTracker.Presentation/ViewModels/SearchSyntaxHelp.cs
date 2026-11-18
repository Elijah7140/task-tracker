namespace TaskTracker.Presentation.ViewModels;

/// <summary>The examples shown in the Search page's "?" help; PLAN section 7.7 has the full grammar.</summary>
public static class SearchSyntaxHelp
{
    public static IReadOnlyList<SearchSyntaxHelpEntry> Entries { get; } =
    [
        new("deadlock \"billing job\"", "Words and quoted phrases search title, description and ticket"),
        new("type:error", "Field equals a value (type and choices match by label)"),
        new("priority:7", "A priority by its number, then by its name"),
        new("title~index", "Text contains (title, ticket and text fields)"),
        new("priority!=low", "Field is not the value"),
        new("priority>high", "More important than High; > and < also work on dates and numbers"),
        new("priority>=high", "High or more important; >= and <= work on priority and dates"),
        new("due<2026-12-01", "Dates are yyyy-MM-dd, today, tomorrow, yesterday, +3d or -1w"),
        new("due:today..+7d", "An inclusive range between two values"),
        new("effort:2.5", "Numbers use a dot for decimals"),
        new("has:ticket", "The field has a value"),
        new("no:due", "The field is empty"),
        new("status:Testing", "A status by name; status~prog matches part of a name"),
        new("is:done  is:open", "Completed or open items; is:done and completed:yes include completed items"),
        new("title:\"two words\"", "Quote values that contain spaces")
    ];
}