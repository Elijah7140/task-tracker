using System.Diagnostics;

using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Reminders;
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
            InitializeWindow(desktop, shell, _services);
        }

        base.OnFrameworkInitializationCompleted();
    }

    private static void InitializeWindow(IClassicDesktopStyleApplicationLifetime desktop,
        MainWindowViewModel shell, ServiceProvider services)
    {
        var window = new MainWindow
        {
            DataContext = shell,
            ExtendClientAreaToDecorationsHint = true,
            ExtendClientAreaTitleBarHeightHint = 36,
        };
        desktop.MainWindow = window;
        var reminders = new DesktopReminderHost(services, desktop, window, shell);
        window.Opened += StartAsync;
        desktop.Exit += (_, _) =>
        {
            reminders.Dispose();
            services.Dispose();
        };

        async void StartAsync(object? sender, EventArgs args)
        {
            window.Opened -= StartAsync;
            await shell.GoHomeAsync();
            await reminders.StartAsync();
        }
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