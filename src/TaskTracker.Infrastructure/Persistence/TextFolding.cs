using System.Diagnostics.CodeAnalysis;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>
/// The one case-folding rule used for search comparisons, applied both to stored text
/// (through the SQLite <c>tt_fold</c> function) and to the user's search input.
/// </summary>
internal static class TextFolding
{
    /// <summary>
    /// Folds text for case-insensitive comparison. Upper-casing first maps every sigma
    /// form (σ, ς) to Σ before lower-casing; <c>ToLowerInvariant</c> alone keeps the final
    /// sigma ς distinct from σ, so "ΟΣ" would not equal "ος".
    /// </summary>
    [return: NotNullIfNotNull(nameof(value))]
    public static string? Fold(string? value)
    {
        return value?.ToUpperInvariant().ToLowerInvariant();
    }
}