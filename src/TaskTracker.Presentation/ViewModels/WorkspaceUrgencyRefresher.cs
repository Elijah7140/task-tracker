using TaskTracker.Core.Items;
using TaskTracker.Core.Urgency;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Refreshes row urgency on a clock tick and dispatches updates to the UI context.</summary>
public sealed class WorkspaceUrgencyRefresher : IDisposable
{
    private readonly TimeProvider clock;
    private readonly TimeZoneInfo timeZone;
    private readonly IUiDispatcher dispatcher;
    private readonly Action refresh;
    private readonly ITimer timer;
    private bool disposed;

    public WorkspaceUrgencyRefresher(TimeProvider clock, TimeZoneInfo timeZone, Action refresh,
        IUiDispatcher dispatcher)
    {
        this.clock = clock;
        this.timeZone = timeZone;
        this.refresh = refresh;
        this.dispatcher = dispatcher;
        timer = clock.CreateTimer(OnTick, null, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1));
    }

    /// <summary>Recomputes urgency through Core for the current area tree.</summary>
    public void Refresh(AreaSnapshot? snapshot, IEnumerable<ItemRowViewModel> rows)
    {
        if (snapshot is null || disposed)
        {
            return;
        }

        var thresholds = new UrgencyThresholds(snapshot.Settings.UrgencyYellowThreshold.Value,
            snapshot.Settings.UrgencyRedThreshold.Value);
        var now = clock.GetUtcNow().UtcDateTime;

        foreach (var row in rows)
        {
            RefreshRow(row, snapshot.Items, now, thresholds);
        }
    }

    private void RefreshRow(ItemRowViewModel row, IReadOnlyList<ItemNode> roots, DateTime now,
        UrgencyThresholds thresholds)
    {
        var urgency = UrgencyCalculator.CalculateDisplayed(row.Node, now, timeZone, thresholds);
        var source = urgency.SourceDescendantId is Guid id ? FindTitle(roots, id) : null;
        row.UpdateUrgency(urgency.Value, source);

        foreach (var child in row.Children.Concat(row.CompletedChildren))
        {
            RefreshRow(child, roots, now, thresholds);
        }
    }

    private static string? FindTitle(IEnumerable<ItemNode> nodes, Guid id)
    {
        foreach (var node in nodes)
        {
            if (node.Item.Id == id)
            {
                return node.Item.Title;
            }

            var title = FindTitle(node.Children, id);

            if (title is not null)
            {
                return title;
            }
        }

        return null;
    }

    private void OnTick(object? state)
    {
        if (disposed)
        {
            return;
        }

        dispatcher.Post(() =>
        {
            if (!disposed)
            {
                refresh();
            }
        });
    }

    public void Dispose()
    {
        disposed = true;
        timer.Dispose();
    }
}