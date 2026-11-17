using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Transfer.Csv;

/// <summary>Maps the header row of an import file to the item columns and custom fields, by name ignoring case.</summary>
internal sealed class CsvHeader
{
    private readonly Dictionary<string, int> standardColumns = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<(int Index, FieldDefinition Field)> fieldColumns = [];

    private CsvHeader()
    {
    }

    public IReadOnlyList<(int Index, FieldDefinition Field)> FieldColumns => fieldColumns;

    /// <summary>True when a legacy export could have used the unsuffixed Links column for a custom field.</summary>
    public bool HasCustomLinksField { get; private set; }

    /// <summary>The number of cells in the header row, blank ones included.</summary>
    public int ColumnCount { get; private set; }

    public List<string> Recognized { get; } = [];

    public List<string> Unknown { get; } = [];

    public List<string> Ignored { get; } = [];

    /// <summary>The cell position of a fixed column, or -1 when the file has no such column.</summary>
    public int IndexOf(string column)
    {
        return standardColumns.TryGetValue(column, out var index) ? index : -1;
    }

    /// <summary>A header with no columns, for a file that has none.</summary>
    public static CsvHeader None()
    {
        return new CsvHeader();
    }

    /// <summary>The trimmed text of a fixed column in a record, or empty when the file lacks the column or the cell.</summary>
    public string CellText(CsvRecord record, string column)
    {
        var index = IndexOf(column);

        return index >= 0 && index < record.Cells.Count ? record.Cells[index].Trim() : string.Empty;
    }

    public static CsvHeader Read(CsvRecord record, CsvImportContext context, IssueList issues)
    {
        var header = new CsvHeader
        {
            ColumnCount = record.Cells.Count,
            HasCustomLinksField = context.Fields.Any(field =>
                field.DisplayName.Equals(CsvColumns.Links, StringComparison.OrdinalIgnoreCase))
        };
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var index = 0; index < record.Cells.Count; index++)
        {
            var name = record.Cells[index].Trim();

            if (name.Length > 0)
            {
                header.AddColumn(name, index, context, seen, issues);
            }
        }

        if (header.IndexOf(CsvColumns.Title) < 0)
        {
            issues.Add("Row 1", $"The header needs a '{CsvColumns.Title}' column.");
        }

        return header;
    }

    private void AddColumn(string name, int index, CsvImportContext context, HashSet<string> seen, IssueList issues)
    {
        if (!seen.Add(name))
        {
            issues.Add("Row 1", $"The column '{name}' appears more than once.");
            return;
        }

        var standard = CsvColumns.Standard.FirstOrDefault(column => string.Equals(column, name, StringComparison.OrdinalIgnoreCase));
        var field = context.Fields.FirstOrDefault(candidate =>
            string.Equals(CsvColumns.FieldHeader(candidate.DisplayName), name, StringComparison.OrdinalIgnoreCase));

        if (standard is not null)
        {
            AddStandard(standard, index);
        }
        else if (field is not null)
        {
            fieldColumns.Add((index, field));
            Recognized.Add(name);
        }
        else
        {
            Unknown.Add(name);
        }
    }

    private void AddStandard(string standard, int index)
    {
        standardColumns[standard] = index;

        if (CsvColumns.IgnoredOnImport.Contains(standard))
        {
            Ignored.Add(standard);
        }
        else
        {
            Recognized.Add(standard);
        }
    }
}