using System.Globalization;

namespace TaskTracker.Presentation.Tests;

public sealed class TestCultureTests
{
    [Fact]
    public void Tests_run_in_en_US_on_the_test_thread()
    {
        Assert.Equal("en-US", CultureInfo.CurrentCulture.Name);
    }

    [Fact]
    public async Task Tests_run_in_en_US_on_thread_pool_threads()
    {
        var name = await Task.Run(() => CultureInfo.CurrentCulture.Name);

        Assert.Equal("en-US", name);
    }
}