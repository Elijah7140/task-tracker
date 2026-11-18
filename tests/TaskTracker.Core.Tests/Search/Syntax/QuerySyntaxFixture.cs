using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;

namespace TaskTracker.Core.Tests.Search.Syntax;

/// <summary>Fields, choices and a fixed clock shared by the query syntax tests.</summary>
internal static class QuerySyntaxFixture
{
    internal static readonly Guid Critical = Guid.Parse("00000000-0000-0000-0000-0000000000c1");
    internal static readonly Guid High = Guid.Parse("00000000-0000-0000-0000-0000000000c2");
    internal static readonly Guid Medium = Guid.Parse("00000000-0000-0000-0000-0000000000c3");
    internal static readonly Guid Low = Guid.Parse("00000000-0000-0000-0000-0000000000c4");
    internal static readonly Guid ErrorType = Guid.Parse("00000000-0000-0000-0000-0000000000e1");
    internal static readonly Guid NeedsReview = Guid.Parse("00000000-0000-0000-0000-0000000000e2");

    internal static readonly IReadOnlyList<SearchableField> SearchFields =
    [
        new("title", "Title", FieldDataType.Text, null),
        new("ticket", "Ticket Number", FieldDataType.Text, null),
        new("type", "Type", FieldDataType.Choice, null),
        new("priority", "Priority", FieldDataType.Choice, null),
        new("due", "Due Date", FieldDataType.Date, null),
        new("scheduled", "Scheduled Date", FieldDataType.Date, null),
        new("status", "Status", FieldDataType.Text, null),
        new("completed", "Completed", FieldDataType.Boolean, null),
        new("effort", "Effort", FieldDataType.Number, Guid.NewGuid()),
        new("flagged", "Flagged", FieldDataType.Boolean, Guid.NewGuid())
    ];

    internal static readonly IReadOnlyDictionary<string, IReadOnlyList<SearchChoice>> Choices =
        new Dictionary<string, IReadOnlyList<SearchChoice>>
        {
            ["priority"] =
            [
                new(Critical, "Critical", 0), new(High, "High", 1), new(Medium, "Medium", 2), new(Low, "Low", 3)
            ],
            ["type"] = [new(ErrorType, "Error", 0), new(NeedsReview, "Needs review", 1)]
        };

    /// <summary>A parser whose clock reads 2026-11-13 12:00 UTC and whose zone is UTC.</summary>
    internal static ItemQueryParser Parser()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));
        return new ItemQueryParser(clock, TimeZoneInfo.Utc);
    }

    internal static QueryParseResult Parse(string text)
    {
        return Parser().Parse(text, SearchFields, Choices);
    }
}