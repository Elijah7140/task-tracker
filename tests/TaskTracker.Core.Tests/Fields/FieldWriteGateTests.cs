using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Tests.Fields;

public sealed class FieldWriteGateTests
{
    [Fact]
    public async Task Second_writer_waits_until_first_writer_releases_the_gate()
    {
        var gate = new FieldWriteGate();
        var first = await gate.EnterAsync(TestContext.Current.CancellationToken);

        var second = gate.EnterAsync(TestContext.Current.CancellationToken);

        Assert.False(second.IsCompleted);

        first.Dispose();
        using var secondLease = await second;

        Assert.True(second.IsCompletedSuccessfully);
    }
}