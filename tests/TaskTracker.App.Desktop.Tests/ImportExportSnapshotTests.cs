using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Approved images of the CSV import preview and the Home import / export menu.</summary>
public sealed class ImportExportSnapshotTests
{
    private const string CsvWithAnErrorRow =
        "Title,Type,Priority,Due date,Mystery\r\n" +
        "Update the invoice template,Change,High,2026-11-20,x\r\n" +
        "Investigate timeouts,Error,Critical,2026-11-18,y\r\n" +
        "Plan the release call,Bug,Low,2026-12-01,z\r\n";

    private const string ValidCsv =
        "Title,Type,Priority,Due date,Project\r\n" +
        "Update the invoice template,Change,High,2026-11-20,Billing DB\r\n" +
        "Investigate timeouts,Error,Critical,2026-11-18,Billing DB\r\n" +
        "Plan the release call,Discussion,Low,2026-12-01,Billing DB\r\n";

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Csv_import_preview_with_an_error_row_matches_approved_image(bool dark)
    {
        await CapturePreviewAsync(CsvWithAnErrorRow, dark, "csv-import-preview");
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Csv_import_preview_ready_to_import_matches_approved_image(bool dark)
    {
        await CapturePreviewAsync(ValidCsv, dark, "csv-import-preview-ready");
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Home_with_the_import_export_menu_open_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        shell.ShowsTitleBar = true;
        var window = ScreenSnapshotTests.OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "ImportExportButton"));
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.FindAll<MenuItem>(window, "ImportCsvMenuItem").Count == 1);
        var first = HeadlessInput.Find<MenuItem>(window, "ExportAllMenuItem");
        first.Focus(NavigationMethod.Directional);
        await HeadlessInput.WaitUntilAsync(() => first.IsFocused);
        var popup = first.GetVisualAncestors().OfType<OverlayPopupHost>().First();
        WaitForStablePopupBounds(() => new Rect(popup.TranslatePoint(default, window)!.Value, popup.Bounds.Size));
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"home-import-export-menu-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaFact]
    public void Popup_capture_waits_for_both_position_and_size_to_settle()
    {
        var frames = new Queue<Rect>(
        [
            new(10, 20, 200, 100),
            new(11, 20, 200, 100),
            new(11, 20, 201, 100),
            new(11, 20, 201, 100)
        ]);

        WaitForStablePopupBounds(frames.Dequeue);

        Assert.Empty(frames);
    }

    private static void WaitForStablePopupBounds(Func<Rect> readBounds)
    {
        Rect? previous = null;
        for (var frame = 0; frame < 20; frame++)
        {
            Dispatcher.UIThread.RunJobs();
            AvaloniaHeadlessPlatform.ForceRenderTimerTick(1);
            Dispatcher.UIThread.RunJobs();
            var current = readBounds();
            if (current == previous)
            {
                return;
            }

            previous = current;
        }

        Assert.Fail("The menu popup did not reach stable bounds.");
    }

    private static async Task CapturePreviewAsync(string csv, bool dark, string snapshotName)
    {
        using var folder = new TempFolder();
        await File.WriteAllTextAsync(folder.File("tasks.csv"), csv);
        var files = new FakeFilePickerService { OpenPath = folder.File("tasks.csv") };
        var window = new MainWindow { Width = 1200, Height = 800 };
        using var services = await TestServices.CreateAsync(window, files);
        await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        ShowOwner(window, shell, dark);
        await shell.GoHomeAsync();
        var home = (HomeViewModel)shell.CurrentPage!;

        var import = home.Transfer!.ImportCsvAsync();
        HeadlessInput.Press(await WaitForDialogAsync(window), Key.Enter);
        var preview = await WaitForDialogAsync(window, "Import CSV");
        Dispatcher.UIThread.RunJobs();
        using var frame = preview.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"{snapshotName}-{ScreenSnapshotTests.ThemeName(dark)}");
        HeadlessInput.Press(preview, Key.Escape);
        await import;
        window.Close();
    }

    private static void ShowOwner(MainWindow window, MainWindowViewModel shell, bool dark)
    {
        Avalonia.Application.Current!.RequestedThemeVariant = dark
            ? Avalonia.Styling.ThemeVariant.Dark
            : Avalonia.Styling.ThemeVariant.Light;
        window.DataContext = shell;
        window.Show();
    }

    private static async Task<Window> WaitForDialogAsync(Window owner, string? title = null)
    {
        await HeadlessInput.WaitUntilAsync(() => owner.OwnedWindows.Any(dialog => title is null || dialog.Title == title));

        return owner.OwnedWindows.First(dialog => title is null || dialog.Title == title);
    }

    private sealed class TempFolder : IDisposable
    {
        public TempFolder()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"tasktracker-ui-files-{Guid.CreateVersion7()}");
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public string File(string name)
        {
            return System.IO.Path.Combine(Path, name);
        }

        public void Dispose()
        {
            Directory.Delete(Path, recursive: true);
        }
    }
}