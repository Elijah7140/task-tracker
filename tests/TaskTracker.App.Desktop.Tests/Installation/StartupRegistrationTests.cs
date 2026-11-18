using TaskTracker.App.Desktop.Installation;

namespace TaskTracker.App.Desktop.Tests.Installation;

public sealed class StartupRegistrationTests
{
    [Fact]
    public void Without_an_entry_the_option_is_unavailable_and_applying_does_nothing()
    {
        var registration = new StartupRegistration(null);

        var applied = registration.TryApply(true);

        Assert.False(registration.IsAvailable);
        Assert.False(applied);
    }

    [Fact]
    public void Enabling_writes_the_entry_and_disabling_removes_it()
    {
        var runKey = new FakeRunKey();
        var registration = new StartupRegistration(new WindowsStartupEntry(runKey, @"C:\TaskTracker.exe"));

        var enabled = registration.TryApply(true);
        var valuesWhileEnabled = runKey.Values.Count;
        var disabled = registration.TryApply(false);

        Assert.True(enabled);
        Assert.Equal(1, valuesWhileEnabled);
        Assert.True(disabled);
        Assert.Empty(runKey.Values);
    }

    [Fact]
    public void A_refused_write_is_reported_instead_of_thrown()
    {
        var registration = new StartupRegistration(new RefusingEntry());

        var applied = registration.TryApply(true);

        Assert.False(applied);
    }

    private sealed class RefusingEntry : IStartupEntry
    {
        public void Write()
        {
            throw new UnauthorizedAccessException("Access denied.");
        }

        public void Remove()
        {
            throw new UnauthorizedAccessException("Access denied.");
        }
    }
}