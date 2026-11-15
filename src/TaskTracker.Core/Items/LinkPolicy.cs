namespace TaskTracker.Core.Items;

/// <summary>
/// Decides which addresses the app stores and opens (§7.10). Only http, https and mailto links are
/// accepted, so a file:// path or a custom scheme can never be saved or launched from the app.
/// </summary>
public static class LinkPolicy
{
    /// <summary>The longest address a link may have, once trimmed.</summary>
    public const int UrlMaxLength = 2000;

    /// <summary>The longest title a link may have, once trimmed.</summary>
    public const int TitleMaxLength = 300;

    /// <summary>The most links one item may carry, so a draft or a file cannot grow without bound.</summary>
    public const int MaxLinksPerItem = 100;

    private static readonly string[] OpenableSchemes = [Uri.UriSchemeHttp, Uri.UriSchemeHttps, Uri.UriSchemeMailto];

    /// <summary>Returns the first problem with a link, or null when it is acceptable.</summary>
    public static string? Validate(string? url, string? title)
    {
        var trimmedUrl = NormalizeUrl(url);

        if (trimmedUrl.Length == 0)
        {
            return "Enter a link address.";
        }

        if (trimmedUrl.Length > UrlMaxLength)
        {
            return $"A link address must be {UrlMaxLength} characters or fewer.";
        }

        if (trimmedUrl.Any(char.IsWhiteSpace))
        {
            return "A link address cannot contain spaces; write a space as %20.";
        }

        if (!IsOpenable(trimmedUrl))
        {
            return "A link must be a full http, https or mailto address.";
        }

        if (NormalizeTitle(title)?.Length > TitleMaxLength)
        {
            return $"A link title must be {TitleMaxLength} characters or fewer.";
        }

        return null;
    }

    /// <summary>True when the text is an absolute http, https or mailto address the app may launch.</summary>
    public static bool IsOpenable(string? url)
    {
        return TryCreateUri(url, out _);
    }

    /// <summary>Parses an address, accepting only the schemes in the policy and a host for web links.</summary>
    public static bool TryCreateUri(string? url, out Uri uri)
    {
        uri = null!;

        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out var parsed))
        {
            return false;
        }

        if (!OpenableSchemes.Contains(parsed.Scheme))
        {
            return false;
        }

        if (parsed.Scheme != Uri.UriSchemeMailto && string.IsNullOrEmpty(parsed.Host))
        {
            return false;
        }

        uri = parsed;
        return true;
    }

    /// <summary>Trims an address; null becomes empty.</summary>
    public static string NormalizeUrl(string? url)
    {
        return url?.Trim() ?? string.Empty;
    }

    /// <summary>Trims a title; blank becomes null.</summary>
    public static string? NormalizeTitle(string? title)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            return null;
        }

        return title.Trim();
    }
}