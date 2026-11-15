using System.Text;

namespace TaskTracker.Core.Transfer.Csv;

/// <summary>
/// Reads RFC 4180 text: quoted cells may hold commas, doubled quotes and line breaks; records end
/// with CRLF, LF or CR; a leading byte order mark and blank lines are ignored.
/// </summary>
internal sealed class CsvParser
{
    private const char ByteOrderMark = (char)0xFEFF;

    private readonly string text;
    private readonly List<TransferIssue> issues = [];
    private int position;
    private int rowNumber;

    private CsvParser(string text)
    {
        this.text = text.TrimStart(ByteOrderMark);
    }

    public static CsvTable Parse(string text)
    {
        return new CsvParser(text).ParseAll();
    }

    private bool AtEnd => position >= text.Length;

    private CsvTable ParseAll()
    {
        var records = new List<CsvRecord>();

        while (!AtEnd)
        {
            rowNumber++;
            var cells = ReadRecord();

            if (!IsBlankLine(cells))
            {
                records.Add(new CsvRecord(rowNumber, cells));
            }
        }

        return new CsvTable(records, issues);
    }

    private static bool IsBlankLine(List<string> cells)
    {
        return cells.Count == 1 && cells[0].Length == 0;
    }

    private List<string> ReadRecord()
    {
        var cells = new List<string>();

        while (true)
        {
            cells.Add(ReadCell());

            if (AtEnd)
            {
                return cells;
            }

            if (text[position] == ',')
            {
                position++;
                continue;
            }

            SkipLineBreak();
            return cells;
        }
    }

    private string ReadCell()
    {
        if (!AtEnd && text[position] == '"')
        {
            return ReadQuotedCell();
        }

        var start = position;

        while (!AtEnd && !IsDelimiter(text[position]))
        {
            position++;
        }

        return text[start..position];
    }

    private string ReadQuotedCell()
    {
        var cell = new StringBuilder();
        position++;

        while (!AtEnd)
        {
            var character = text[position++];

            if (character != '"')
            {
                cell.Append(character);
            }
            else if (!AtEnd && text[position] == '"')
            {
                cell.Append('"');
                position++;
            }
            else
            {
                SkipTextAfterClosingQuote();
                return cell.ToString();
            }
        }

        issues.Add(new TransferIssue($"Row {rowNumber}", "A quoted cell is never closed."));
        return cell.ToString();
    }

    private void SkipTextAfterClosingQuote()
    {
        if (AtEnd || IsDelimiter(text[position]))
        {
            return;
        }

        issues.Add(new TransferIssue($"Row {rowNumber}", "Unexpected text after the closing quote of a cell."));

        while (!AtEnd && !IsDelimiter(text[position]))
        {
            position++;
        }
    }

    private void SkipLineBreak()
    {
        if (text[position] == '\r' && position + 1 < text.Length && text[position + 1] == '\n')
        {
            position++;
        }

        position++;
    }

    private static bool IsDelimiter(char character)
    {
        return character is ',' or '\r' or '\n';
    }
}