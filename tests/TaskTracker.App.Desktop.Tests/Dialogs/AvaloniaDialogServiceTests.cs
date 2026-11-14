using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Styling;
using Avalonia.Threading;

using TaskTracker.App.Desktop.Dialogs;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.App.Desktop.Tests.Dialogs;

/// <summary>Exercises modal keyboard defaults and captures their rendered windows.</summary>
public sealed class AvaloniaDialogServiceTests
{
    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Prompt_uses_enter_to_save_and_escape_to_cancel(bool cancel)
    {
        var owner = OpenOwner();
        var service = new AvaloniaDialogService(owner);
        var result = service.PromptAsync("New project", "Name");
        var dialog = OpenDialog(owner);

        dialog.KeyTextInput("Billing DB");
        Press(dialog, cancel ? Key.Escape : Key.Enter);
        Dispatcher.UIThread.RunJobs();

        Assert.Equal(cancel ? null : "Billing DB", await result);
        owner.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Confirmation_uses_enter_to_confirm_and_escape_to_cancel(bool cancel)
    {
        var owner = OpenOwner();
        var service = new AvaloniaDialogService(owner);
        var result = service.ConfirmAsync("Delete item", "Delete review?", "Delete");
        var dialog = OpenDialog(owner);

        Press(dialog, cancel ? Key.Escape : Key.Enter);
        Dispatcher.UIThread.RunJobs();

        Assert.Equal(!cancel, await result);
        owner.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Unsaved_changes_uses_enter_to_save_and_escape_to_cancel(bool cancel)
    {
        var owner = OpenOwner();
        var service = new AvaloniaDialogService(owner);
        var result = service.ResolveDraftAsync();
        var dialog = OpenDialog(owner);

        Press(dialog, cancel ? Key.Escape : Key.Enter);
        Dispatcher.UIThread.RunJobs();

        Assert.Equal(cancel ? DraftDecision.Cancel : DraftDecision.Save, await result);
        owner.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Folder_picker_uses_enter_to_move_and_escape_to_cancel(bool cancel)
    {
        var owner = OpenOwner();
        var service = new AvaloniaDialogService(owner);
        var folder = new FolderChoice(null, "Project root", 0);
        var result = service.PickFolderAsync("Move folder", [folder]);
        var dialog = OpenDialog(owner);

        Press(dialog, cancel ? Key.Escape : Key.Enter);
        Dispatcher.UIThread.RunJobs();

        Assert.Equal(cancel ? null : folder, await result);
        owner.Close();
    }

    [AvaloniaTheory]
    [InlineData(Key.Enter)]
    [InlineData(Key.Escape)]
    public async Task Message_closes_with_enter_or_escape(Key key)
    {
        var owner = OpenOwner();
        var service = new AvaloniaDialogService(owner);
        var result = service.ShowMessageAsync("Notice", "Saved.");
        var dialog = OpenDialog(owner);

        Press(dialog, key);
        Dispatcher.UIThread.RunJobs();

        Assert.True(result.IsCompletedSuccessfully);
        owner.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task New_project_dialog_matches_approved_image(bool dark)
    {
        var owner = OpenOwner(dark);
        var service = new AvaloniaDialogService(owner);
        var result = service.PromptAsync("New project", "Name");
        var dialog = OpenDialog(owner);
        dialog.KeyTextInput("Billing DB");
        using var frame = dialog.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"new-project-{ThemeName(dark)}");
        Press(dialog, Key.Escape);
        await result;
        owner.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Confirm_delete_dialog_matches_approved_image(bool dark)
    {
        var owner = OpenOwner(dark);
        var service = new AvaloniaDialogService(owner);
        var result = service.ConfirmAsync("Delete item", "Delete review and its sub-items?", "Delete");
        var dialog = OpenDialog(owner);
        using var frame = dialog.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"confirm-delete-{ThemeName(dark)}");
        Press(dialog, Key.Escape);
        await result;
        owner.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Unsaved_draft_dialog_matches_approved_image(bool dark)
    {
        var owner = OpenOwner(dark);
        var result = new AvaloniaDialogService(owner).ResolveDraftAsync();
        var dialog = OpenDialog(owner);

        AssertDialogSnapshot(dialog, "unsaved-draft", dark);
        Press(dialog, Key.Escape);
        await result;
        owner.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Folder_picker_dialog_matches_approved_image(bool dark)
    {
        var owner = OpenOwner(dark);
        var folders = new[] { new FolderChoice(null, "Project root", 0) };
        var result = new AvaloniaDialogService(owner).PickFolderAsync("Move folder", folders);
        var dialog = OpenDialog(owner);

        AssertDialogSnapshot(dialog, "folder-picker", dark);
        Press(dialog, Key.Escape);
        await result;
        owner.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Message_dialog_matches_approved_image(bool dark)
    {
        var owner = OpenOwner(dark);
        var result = new AvaloniaDialogService(owner).ShowMessageAsync("Notice", "Saved.");
        var dialog = OpenDialog(owner);

        AssertDialogSnapshot(dialog, "message", dark);
        Press(dialog, Key.Escape);
        await result;
        owner.Close();
    }

    private static void AssertDialogSnapshot(Window dialog, string name, bool dark)
    {
        using var frame = dialog.CaptureRenderedFrame();
        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"{name}-{ThemeName(dark)}");
    }

    private static Window OpenOwner(bool dark = false)
    {
        Application.Current!.RequestedThemeVariant = dark ? ThemeVariant.Dark : ThemeVariant.Light;
        var owner = new Window { Width = 1200, Height = 800 };
        owner.Show();
        return owner;
    }

    private static Window OpenDialog(Window owner)
    {
        Dispatcher.UIThread.RunJobs();
        return Assert.Single(owner.OwnedWindows);
    }

    private static void Press(Window dialog, Key key)
    {
        dialog.KeyPress(key, RawInputModifiers.None, PhysicalKey.None, null);
    }

    private static string ThemeName(bool dark)
    {
        return dark ? "dark" : "light";
    }
}