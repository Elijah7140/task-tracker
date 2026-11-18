using TaskTracker.App.Desktop.SingleInstance;

namespace TaskTracker.App.Desktop.Tests.SingleInstance;

/// <summary>Checks instance naming and the second-launch handshake with real named mutexes and pipes.</summary>
public sealed class SingleInstanceGuardTests
{
    [Fact]
    public void The_name_depends_on_the_full_database_path_and_the_user()
    {
        var path = Path.Combine(Path.GetTempPath(), "tasktracker-guard", "tasks.db");

        var name = SingleInstanceGuard.InstanceName(path, "alex");

        Assert.Matches("^TaskTracker-[0-9a-f]{32}$", name);
        Assert.Equal(name, SingleInstanceGuard.InstanceName(Path.Combine(path, "..", "tasks.db"), "alex"));
        Assert.NotEqual(name, SingleInstanceGuard.InstanceName(path + ".other", "alex"));
        Assert.NotEqual(name, SingleInstanceGuard.InstanceName(path, "sam"));
    }

    [Fact]
    public void The_name_follows_the_case_sensitivity_of_the_platform_paths()
    {
        var path = Path.Combine(Path.GetTempPath(), "TaskTracker-Guard", "Tasks.db");

        var name = SingleInstanceGuard.InstanceName(path, "alex");
        var lowerCaseName = SingleInstanceGuard.InstanceName(path.ToLowerInvariant(), "alex");

        Assert.Equal(OperatingSystem.IsWindows(), name == lowerCaseName);
    }

    [Fact]
    public async Task A_second_launch_on_the_same_database_brings_the_first_forward_and_exits()
    {
        var path = UniqueDatabasePath();
        using var first = SingleInstanceGuard.Acquire(path, Environment.UserName);
        Assert.NotNull(first);
        var activated = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        first.ActivationRequested += () => activated.TrySetResult();

        var second = SingleInstanceGuard.Acquire(path, Environment.UserName);

        Assert.Null(second);
        await activated.Task.WaitAsync(TimeSpan.FromSeconds(10), TestContext.Current.CancellationToken);
    }

    [Fact]
    public void Different_databases_run_side_by_side()
    {
        using var first = SingleInstanceGuard.Acquire(UniqueDatabasePath(), Environment.UserName);
        using var second = SingleInstanceGuard.Acquire(UniqueDatabasePath(), Environment.UserName);

        Assert.NotNull(first);
        Assert.NotNull(second);
    }

    [Fact]
    public void A_database_can_be_opened_again_after_its_guard_is_disposed()
    {
        var path = UniqueDatabasePath();
        SingleInstanceGuard.Acquire(path, Environment.UserName)!.Dispose();

        using var again = SingleInstanceGuard.Acquire(path, Environment.UserName);

        Assert.NotNull(again);
    }

    private static string UniqueDatabasePath()
    {
        return Path.Combine(Path.GetTempPath(), $"tasktracker-guard-{Guid.CreateVersion7()}.db");
    }
}