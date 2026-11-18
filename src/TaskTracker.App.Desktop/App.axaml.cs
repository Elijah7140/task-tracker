using System.Diagnostics;

using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Reminders;
using TaskTracker.App.Desktop.SingleInstance;
using TaskTracker.App.Desktop.Views;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop;

public sealed partial class App : Application
{
    private ServiceProvider? _services;
    private MainWindowViewModel? _shell;
    private DesktopReminderHost? _reminders;

    /// <summary>The single-instance guard of a real launch; null in tests and the designer.</summary>
    internal SingleInstanceGuard? InstanceGuard { get; init; }

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

    private void InitializeWindow(IClassicDesktopStyleApplicationLifetime desktop,
        MainWindowViewModel shell, ServiceProvider services)
    {
        var window = new MainWindow
        {
            DataContext = shell,
            ExtendClientAreaToDecorationsHint = true,
            ExtendClientAreaTitleBarHeightHint = 36,
        };
        desktop.MainWindow = window;
        _shell = shell;
        _reminders = new DesktopReminderHost(services, desktop, window, shell);
        window.Opened += OnWindowOpened;
        desktop.Exit += OnExit;
        if (InstanceGuard is not null)
        {
            InstanceGuard.ActivationRequested += OnActivationRequested;
        }
    }

    private async void OnWindowOpened(object? sender, EventArgs args)
    {
        if (sender is Window window)
        {
            window.Opened -= OnWindowOpened;
        }

        try
        {
            await _shell!.GoHomeAsync();
            await _shell.LoadCurrentItemAsync();
            await _reminders!.StartAsync();
        }
        catch (Exception exception)
        {
            ReportUnexpected(exception);
        }
    }

    /// <summary>Another launch on the same database asked this window to come forward.</summary>
    private void OnActivationRequested()
    {
        Dispatcher.UIThread.Post(() => _reminders?.Open());
    }

    private void OnExit(object? sender, ControlledApplicationLifetimeExitEventArgs args)
    {
        if (InstanceGuard is not null)
        {
            InstanceGuard.ActivationRequested -= OnActivationRequested;
        }

        _reminders?.Dispose();
        _services?.Dispose();
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