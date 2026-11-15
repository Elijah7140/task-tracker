using System.Text;

using TaskTracker.Core;
using TaskTracker.Core.Transfer.Csv;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Reads and writes export files: UTF-8 with a BOM for CSV (Excel), without for JSON. Reading is strict, so a
/// file in another encoding is refused with advice instead of being imported as garbled text, and very large
/// files are refused before they are loaded.
/// </summary>
internal static class TransferFiles
{
    /// <summary>The largest file an import will read.</summary>
    public const long MaxFileBytes = 50L * 1024 * 1024;

    private static readonly Encoding JsonEncoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
    private static readonly Encoding StrictUtf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
    private static readonly byte[] Utf8Preamble = [0xEF, 0xBB, 0xBF];

    public static Task WriteAsync(string path, string text, TransferFileKind kind)
    {
        var encoding = kind == TransferFileKind.Csv ? CsvFormat.Utf8WithBom : JsonEncoding;

        return File.WriteAllTextAsync(path, text, encoding);
    }

    /// <summary>
    /// Reads a UTF-8 text file (a byte order mark is removed). Throws <see cref="DomainRuleException"/> with a
    /// message for the user when the file is too large or is not valid UTF-8.
    /// </summary>
    public static async Task<string> ReadAsync(string path, TransferFileKind kind)
    {
        var length = new FileInfo(path).Length;

        if (length > MaxFileBytes)
        {
            var megabytes = Math.Ceiling(length / 1048576.0);
            throw new DomainRuleException($"This file is {megabytes} MB; the largest file that can be imported is {MaxFileBytes / 1048576} MB.");
        }

        var bytes = await File.ReadAllBytesAsync(path);

        return await Task.Run(() => Decode(bytes, kind));
    }

    /// <summary>A file name made of the name with characters a file system rejects replaced, plus the extension for the kind.</summary>
    public static string SuggestedName(string name, TransferFileKind kind)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(name.Select(character => invalid.Contains(character) ? '-' : character).ToArray());
        var extension = kind == TransferFileKind.Csv ? ".csv" : ".json";

        return cleaned.Trim() + extension;
    }

    private static string Decode(byte[] bytes, TransferFileKind kind)
    {
        var skip = bytes.AsSpan().StartsWith(Utf8Preamble) ? Utf8Preamble.Length : 0;

        try
        {
            return StrictUtf8.GetString(bytes, skip, bytes.Length - skip);
        }
        catch (DecoderFallbackException)
        {
            throw new DomainRuleException(NotUtf8Message(kind));
        }
    }

    private static string NotUtf8Message(TransferFileKind kind)
    {
        if (kind == TransferFileKind.Csv)
        {
            return "This file isn't UTF-8. Re-save it as 'CSV UTF-8' and try again.";
        }

        return "This file isn't UTF-8. Re-save it as UTF-8 text and try again.";
    }
}