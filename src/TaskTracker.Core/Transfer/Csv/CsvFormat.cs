using System.Text;

namespace TaskTracker.Core.Transfer.Csv;

/// <summary>The file-level conventions of CSV export (§7.9).</summary>
public static class CsvFormat
{
    /// <summary>UTF-8 with a byte order mark, so Excel opens the file with the right encoding.</summary>
    public static Encoding Utf8WithBom { get; } = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
}