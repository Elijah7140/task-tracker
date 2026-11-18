using TaskTracker.App.Desktop.Installation;

namespace TaskTracker.App.Desktop.Tests.Installation;

public sealed class WindowsStartupEntryTests
{
    private const string ExecutablePath = @"C:\Users\alex\AppData\Local\TaskTracker\current\TaskTracker.App.Desktop.exe";

    [Fact]
    public void Writing_adds_the_quoted_executable_under_the_run_key()
    {
        var runKey = new FakeRunKey();
        var entry = new WindowsStartupEntry(runKey, ExecutablePath);

        entry.Write();

        Assert.Equal($"\"{ExecutablePath}\"", runKey.Values["TaskTracker"]);
    }

    [Fact]
    public void Writing_twice_keeps_one_value()
    {
        var runKey = new FakeRunKey();
        var entry = new WindowsStartupEntry(runKey, ExecutablePath);

        entry.Write();
        entry.Write();

        Assert.Single(runKey.Values);
    }

    [Fact]
    public void Removing_deletes_only_the_app_value()
    {
        var runKey = new FakeRunKey();
        runKey.Values["OtherApp"] = "other.exe";
        var entry = new WindowsStartupEntry(runKey, ExecutablePath);
        entry.Write();

        entry.Remove();

        Assert.Equal(["OtherApp"], runKey.Values.Keys);
    }

    [Fact]
    public void Removing_a_missing_entry_does_nothing()
    {
        var runKey = new FakeRunKey();
        var entry = new WindowsStartupEntry(runKey, ExecutablePath);

        entry.Remove();

        Assert.Empty(runKey.Values);
    }
}