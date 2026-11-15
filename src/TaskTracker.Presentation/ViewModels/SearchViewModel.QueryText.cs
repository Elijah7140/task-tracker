using TaskTracker.Core.Fields;
using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// The query text box of the search page. The text and the filter rows describe the same query:
/// pressing Enter parses the text into rows, and editing a row rewrites the text.
/// </summary>
public sealed partial class SearchViewModel
{
    private readonly ItemQueryParser? parser;
    private string queryText = string.Empty;
    private bool queryTextEdited;
    private bool syncSuspended;
    private int queryVersion;

    /// <summary>The syntax examples shown by the "?" help.</summary>
    public IReadOnlyList<SearchSyntaxHelpEntry> HelpEntries => SearchSyntaxHelp.Entries;

    /// <summary>
    /// The text in the query box: plain words, or the query syntax. Typing marks it as not yet
    /// applied; <see cref="SubmitAsync"/> parses it.
    /// </summary>
    public string QueryText
    {
        get => queryText;
        set
        {
            if (SetProperty(ref queryText, value))
            {
                queryTextEdited = true;
                OnPropertyChanged(nameof(CanSearch));
            }
        }
    }

    /// <summary>
    /// Runs the search the way Enter and the Search button do: text typed since the last run is
    /// parsed into rows first, and nothing runs when it has errors.
    /// </summary>
    public async Task SubmitAsync()
    {
        if (disposed)
        {
            return;
        }

        var version = ++queryVersion;

        if (queryTextEdited && !await ApplyQueryTextAsync(version))
        {
            return;
        }

        if (version == queryVersion)
        {
            await RunAsync();
        }
    }

    /// <param name="showDisplayText">True to replace the text with its user-readable form (choice ids become labels).</param>
    private async Task<bool> ApplyQueryTextAsync(bool showDisplayText = false)
    {
        return await ApplyQueryTextAsync(++queryVersion, showDisplayText);
    }

    private async Task<bool> ApplyQueryTextAsync(int version, bool showDisplayText = false)
    {
        if (parser is null)
        {
            Text = QueryText;
            ShowQueryText(Text);
            return true;
        }

        var submittedText = QueryText;
        await ScopeRefreshTask;
        var parsed = await ParseAsync(submittedText);

        if (disposed || version != queryVersion)
        {
            return false;
        }

        if (!parsed.Succeeded)
        {
            Error = DescribeErrors(submittedText, parsed);
            return false;
        }

        await ApplyParsedAsync(parsed);

        if (showDisplayText)
        {
            ShowQueryText(parsed.DisplayText);
        }

        return true;
    }

    private async Task<QueryParseResult> ParseAsync(string queryToParse)
    {
        var keys = ItemQueryParser.ClauseKeys(queryToParse);
        var choices = new Dictionary<string, IReadOnlyList<SearchChoice>>();

        var needed = fields.Where(candidate => candidate.DataType == FieldDataType.Choice && keys.Contains(candidate.Key));

        foreach (var field in needed)
        {
            choices[field.Key] = await registry.GetChoicesAsync(field);
        }

        return parser!.Parse(queryToParse, fields, choices);
    }

    private static string DescribeErrors(string queryToParse, QueryParseResult parsed)
    {
        return string.Join("\n", parsed.Errors.Select(error => error.Describe(queryToParse)));
    }

    /// <summary>Replaces the filter rows and free text with a parsed query; the typed text stays as written.</summary>
    private async Task ApplyParsedAsync(QueryParseResult parsed)
    {
        syncSuspended = true;

        try
        {
            ClearFilters();
            Text = parsed.Text ?? string.Empty;
            IncludeCompleted |= parsed.ImpliesIncludeCompleted;
            await AddFiltersAsync(parsed.Filters);
        }
        finally
        {
            syncSuspended = false;
        }

        queryTextEdited = false;
        Error = null;
        OnPropertyChanged(nameof(CanSearch));
    }

    private void ClearFilters()
    {
        foreach (var row in Filters.ToArray())
        {
            RemoveFilter(row);
        }
    }

    private async Task AddFiltersAsync(IReadOnlyList<FieldFilter> filters)
    {
        foreach (var filter in filters)
        {
            var row = CreateRow();
            await row.ApplyAsync(filter);
        }
    }

    /// <summary>Rewrites the text box from the free text and the complete filter rows.</summary>
    private void RefreshQueryText()
    {
        if (syncSuspended)
        {
            return;
        }

        ShowQueryText(parser is null ? Text : FormatCurrentQuery());
    }

    private void ShowQueryText(string value)
    {
        queryText = value;
        queryTextEdited = false;
        OnPropertyChanged(nameof(QueryText));
    }

    /// <summary>Puts text in the box as if the user had typed it, so the next submit parses it.</summary>
    private void TypeQueryText(string value)
    {
        queryText = value;
        queryTextEdited = true;
        OnPropertyChanged(nameof(QueryText));
    }

    private string FormatCurrentQuery()
    {
        return ItemQueryFormatter.Format(Text, CompleteFilters(), ChoicesOfRows());
    }

    private List<FieldFilter> CompleteFilters()
    {
        var filters = new List<FieldFilter>();

        foreach (var row in Filters.Where(candidate => candidate.IsComplete && candidate.IsValid))
        {
            var filter = row.ToFilter();

            if (filter is not null)
            {
                filters.Add(filter);
            }
        }

        return filters;
    }

    private Dictionary<string, IReadOnlyList<SearchChoice>> ChoicesOfRows()
    {
        var choices = new Dictionary<string, IReadOnlyList<SearchChoice>>();

        foreach (var row in Filters)
        {
            if (row.SelectedField is { DataType: FieldDataType.Choice } field)
            {
                choices.TryAdd(field.Key, row.Choices.ToList());
            }
        }

        return choices;
    }
}