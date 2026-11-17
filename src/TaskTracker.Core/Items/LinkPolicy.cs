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
        var problem = ReadAddress(url, out _);

        if (problem is not null)
        {
            return problem;
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
        return ReadAddress(url, out uri) is null;
    }

    private static string? ReadAddress(string? url, out Uri uri)
    {
        uri = null!;
        var address = NormalizeUrl(url);
        var problem = AddressTextProblem(address);

        if (problem is not null)
        {
            return problem;
        }

        if (!Uri.TryCreate(address, UriKind.Absolute, out var parsed)
            || !OpenableSchemes.Contains(parsed.Scheme)
            || (parsed.Scheme != Uri.UriSchemeMailto && string.IsNullOrEmpty(parsed.Host)))
        {
            return "A link must be a full http, https or mailto address.";
        }

        uri = parsed;
        return null;
    }

    private static string? AddressTextProblem(string address)
    {
        if (address.Length == 0)
        {
            return "Enter a link address.";
        }

        if (address.Length > UrlMaxLength)
        {
            return $"A link address must be {UrlMaxLength} characters or fewer.";
        }

        if (address.Any(char.IsWhiteSpace))
        {
            return "A link address cannot contain spaces; write a space as %20.";
        }

        return address.Any(char.IsControl) ? "A link address cannot contain control characters." : null;
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