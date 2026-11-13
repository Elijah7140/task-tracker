using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class MainWindowViewModelTests
{
    [Fact]
    public void Main_window_has_a_title()
    {
        var viewModel = new MainWindowViewModel();

        var title = viewModel.Title;

        Assert.False(string.IsNullOrWhiteSpace(title));
    }
}