using System.Text;

namespace TaskTracker.Core.Search.Syntax;

/// <summary>
/// Splits query text into free-text words and <c>key operator value</c> clauses.
/// It only reads the shape of the text; matching keys to fields happens later.
/// </summary>
internal sealed class QueryScanner
{
    private const string RangeSeparator = "..";

    /// <summary>Longest symbols first, so <c>&gt;=</c> is never read as <c>&gt;</c>.</summary>
    private static readonly string[] Symbols = ["!=", ">=", "<=", ":", ">", "<", "~"];

    private readonly string text;
    private readonly List<string> words = [];
    private readonly List<QueryClause> clauses = [];
    private readonly List<QueryParseError> errors = [];
    private int position;

    public QueryScanner(string text)
    {
        this.text = text;
    }

    public QueryScan Scan()
    {
        while (SkipWhitespace())
        {
            ScanTerm();
        }

        return new QueryScan(words, clauses, errors);
    }

    private bool SkipWhitespace()
    {
        while (position < text.Length && char.IsWhiteSpace(text[position]))
        {
            position++;
        }

        return position < text.Length;
    }

    private void ScanTerm()
    {
        if (text[position] == '"')
        {
            ScanPhrase();
            return;
        }

        var keyEnd = KeyEnd(position);
        var symbol = keyEnd > position ? SymbolAt(keyEnd) : null;

        if (symbol is null)
        {
            ScanWord();
            return;
        }

        ScanClause(keyEnd, symbol);
    }

    private int KeyEnd(int start)
    {
        var index = start;

        while (index < text.Length && IsKeyCharacter(text[index]))
        {
            index++;
        }

        return index;
    }

    private static bool IsKeyCharacter(char character)
    {
        return char.IsLetterOrDigit(character) || character is '_' or '-';
    }

    private string? SymbolAt(int index)
    {
        foreach (var symbol in Symbols)
        {
            if (string.CompareOrdinal(text, index, symbol, 0, symbol.Length) == 0)
            {
                return symbol;
            }
        }

        return null;
    }

    private void ScanWord()
    {
        var start = position;
        SkipToWhitespace();
        words.Add(text[start..position]);
    }

    private void SkipToWhitespace()
    {
        while (position < text.Length && !char.IsWhiteSpace(text[position]))
        {
            position++;
        }
    }

    private void ScanPhrase()
    {
        var start = position;
        var phrase = ReadQuoted();

        if (phrase is null)
        {
            AddError(start, text.Length - start, "A quote was opened but never closed.");
            return;
        }

        if (phrase.Length > 0)
        {
            words.Add(phrase);
        }
    }

    private void ScanClause(int keyEnd, string symbol)
    {
        var start = position;
        var key = text[start..keyEnd];
        position = keyEnd + symbol.Length;
        var endpoints = ReadEndpoints(start);

        if (endpoints is null)
        {
            return;
        }

        if (position < text.Length && !char.IsWhiteSpace(text[position]))
        {
            SkipToWhitespace();
            AddError(start, position - start, "Put a space after a quoted value.");
            return;
        }

        clauses.Add(new QueryClause(start, position - start, key, symbol, endpoints));
    }

    /// <summary>Reads one value or an <c>a..b</c> range; null after recording an error.</summary>
    private List<QueryEndpoint>? ReadEndpoints(int clauseStart)
    {
        var endpoints = new List<QueryEndpoint>();
        var endpoint = ReadEndpoint(clauseStart);

        while (endpoint is not null)
        {
            endpoints.Add(endpoint);

            if (!AtRangeSeparator())
            {
                return endpoints;
            }

            position += RangeSeparator.Length;
            endpoint = ReadEndpoint(clauseStart);
        }

        return null;
    }

    private QueryEndpoint? ReadEndpoint(int clauseStart)
    {
        if (position < text.Length && text[position] == '"')
        {
            return ReadQuotedEndpoint(clauseStart);
        }

        var start = position;

        while (position < text.Length && !char.IsWhiteSpace(text[position]) && !AtRangeSeparator())
        {
            position++;
        }

        return new QueryEndpoint(text[start..position], false);
    }

    private QueryEndpoint? ReadQuotedEndpoint(int clauseStart)
    {
        var value = ReadQuoted();

        if (value is null)
        {
            AddError(clauseStart, text.Length - clauseStart, "A quote was opened but never closed.");
            return null;
        }

        return new QueryEndpoint(value, true);
    }

    private bool AtRangeSeparator()
    {
        return string.CompareOrdinal(text, position, RangeSeparator, 0, RangeSeparator.Length) == 0;
    }

    /// <summary>
    /// Reads a quoted string starting at the opening quote; <c>\"</c> and <c>\\</c> are escapes.
    /// Returns null (positioned at the end) when the closing quote is missing.
    /// </summary>
    private string? ReadQuoted()
    {
        var value = new StringBuilder();
        position++;

        while (position < text.Length)
        {
            var character = text[position];

            if (character == '"')
            {
                position++;
                return value.ToString();
            }

            value.Append(ReadQuotedCharacter());
        }

        return null;
    }

    private char ReadQuotedCharacter()
    {
        var character = text[position];

        if (character == '\\' && IsEscapableAt(position + 1))
        {
            position++;
            character = text[position];
        }

        position++;
        return character;
    }

    private bool IsEscapableAt(int index)
    {
        return index < text.Length && (text[index] == '"' || text[index] == '\\');
    }

    private void AddError(int start, int length, string message)
    {
        errors.Add(new QueryParseError(start, length, message));
    }
}