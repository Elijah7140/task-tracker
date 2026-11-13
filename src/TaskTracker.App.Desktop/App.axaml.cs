using System.Diagnostics;

using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop;

public sealed partial class App : Application
{
    private ServiceProvider? _services;

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        _services = CompositionRoot.BuildServices();
        RegisterUnexpectedErrorHandlers();

        using (var scope = _services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<DatabaseInitializer>()
                .InitializeAsync().GetAwaiter().GetResult();
        }

        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            DataTemplates.Add(_services.GetRequiredService<ViewLocator>());
            var shell = _services.GetRequiredService<MainWindowViewModel>();
            desktop.MainWindow = new MainWindow
            {
                DataContext = shell,
            };
            desktop.MainWindow.Opened += async (_, _) => await shell.GoHomeAsync();
            desktop.Exit += (_, _) => _services.Dispose();
        }

        base.OnFrameworkInitializationCompleted();
    }

    /// <summary>
    /// Routes failures that no ViewModel expected (anything other than a DomainRuleException)
    /// to one place, so they are traced and shown instead of crashing or vanishing.
    /// </summary>
    private void RegisterUnexpectedErrorHandlers()
    {
        Dispatcher.UIThread.UnhandledException += (_, args) =>
        {
            args.Handled = true;
            ReportUnexpected(args.Exception);
        };

        TaskScheduler.UnobservedTaskException += (_, args) =>
        {
            args.SetObserved();
            Dispatcher.UIThread.Post(() => ReportUnexpected(args.Exception));
        };
    }

    private async void ReportUnexpected(Exception exception)
    {
        Trace.TraceError(exception.ToString());

        try
        {
            var dialogs = _services?.GetRequiredService<IDialogService>();
            if (dialogs is not null)
            {
                await dialogs.ShowMessageAsync("Something went wrong", $"Something went wrong.\n\n{exception}");
            }
        }
        catch (Exception dialogException)
        {
            Trace.TraceError(dialogException.ToString());
        }
    }
}