namespace TaskTracker.App.Desktop.SmokeTests;

/// <summary>Keeps the optional test project runnable in ordinary solution test runs.</summary>
public sealed class SmokeProjectTests
{
    [Fact]
    public void Smoke_project_is_available()
    {
        Assert.Equal("TaskTracker.App.Desktop.SmokeTests", typeof(SmokeProjectTests).Assembly.GetName().Name);
    }
}