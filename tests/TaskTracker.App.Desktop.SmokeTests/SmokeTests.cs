using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.Tools;
using FlaUI.Core.WindowsAPI;

[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace TaskTracker.App.Desktop.SmokeTests;

/// <summary>Exercises the running desktop application through Windows UI Automation.</summary>
public sealed class SmokeTests
{
    [Fact]
    public void Creating_a_project_from_home_shows_its_card()
    {
        Run(session =>
        {
            CreateProject(session);

            Assert.NotNull(session.FindText("Smoke Project"));
        });
    }

    [Fact]
    public void Opening_a_project_focuses_quick_add_and_creates_an_item()
    {
        Run(session =>
        {
            OpenProject(session);

            Assert.True(session.Find("QuickAddBox").Properties.HasKeyboardFocus.Value);

            AddItem(session, "First item");

            Assert.NotNull(session.FindNamed("ItemTitleButton", "First item"));
        });
    }

    [Fact]
    public void Completing_the_only_sub_item_completes_its_parent()
    {
        Run(session =>
        {
            OpenProject(session);
            AddItem(session, "Parent item");
            session.FindNamed("ItemTitleButton", "Parent item").Click();

            session.TypeChord(VirtualKeyShort.CONTROL, VirtualKeyShort.SHIFT, VirtualKeyShort.KEY_N);
            session.TypeInto("DialogInput", "Child item");
            session.Press(VirtualKeyShort.RETURN);
            session.FindRowCheckbox("Child item").Click();
            session.Find("CompletedItemsExpander").Click();
            session.Find("CompletedSubItemsExpander").Click();

            Assert.True(session.FindRowCheckbox("Parent item").IsChecked == true);
            Assert.True(session.FindRowCheckbox("Child item").IsChecked == true);
        });
    }

    [Fact]
    public void Creating_a_folder_from_its_context_menu_adds_an_item_there()
    {
        Run(session =>
        {
            OpenProject(session);
            var root = session.Find("FolderTree").FindFirstDescendant(query => query.ByName("Smoke Project"));
            Assert.NotNull(root);

            root.RightClick();
            session.Find("NewFolderMenuItem").Click();
            session.TypeInto("DialogInput", "Smoke Folder");
            session.Press(VirtualKeyShort.RETURN);
            session.WaitUntil(() => session.Find("FolderTree").FindFirstDescendant(
                query => query.ByName("Smoke Folder")) is not null, "the new folder");
            var folder = session.Find("FolderTree").FindFirstDescendant(query => query.ByName("Smoke Folder"));
            Assert.NotNull(folder);

            folder.Click();
            AddItem(session, "Folder item");

            Assert.NotNull(session.FindNamed("ItemTitleButton", "Folder item"));
        });
    }

    [Fact]
    public void Saving_an_edited_title_updates_the_item_row()
    {
        Run(session =>
        {
            OpenProject(session);
            AddItem(session, "Original title");
            session.FindNamed("ItemTitleButton", "Original title").Click();

            ReplaceText(session, "EditorTitleBox", "Updated title");
            session.Find("EditorSaveButton").AsButton().Invoke();

            Assert.NotNull(session.FindNamed("ItemTitleButton", "Updated title"));
        });
    }

    [Fact]
    public void Deleting_an_item_with_confirmation_removes_its_row()
    {
        Run(session =>
        {
            OpenProject(session);
            AddItem(session, "Delete me");
            session.FindNamed("ItemTitleButton", "Delete me").Click();

            session.Press(VirtualKeyShort.DELETE);
            session.Find("DialogConfirmButton");
            session.Press(VirtualKeyShort.RETURN);
            session.WaitUntil(() => !session.HasControl("DialogConfirmButton") &&
                !HasItemRow(session, "Delete me"), "the delete dialog to close and the item to disappear");

            Assert.False(HasItemRow(session, "Delete me"));
        });
    }

    [Fact]
    public void Saving_an_app_threshold_persists_after_reopening_settings()
    {
        Run(session =>
        {
            session.Find("AppSettingsButton").Click();

            ReplaceText(session, "GlobalYellowThresholdBox", "4");
            Assert.True(session.Find("AppSettingsSaveButton").Properties.IsEnabled.Value);

            session.Find("AppSettingsSaveButton").Click();
            session.WaitUntil(() => !session.Find("AppSettingsSaveButton").Properties.IsEnabled.Value,
                "app settings to finish saving");
            session.Find("AppSettingsBackButton").Click();
            session.Find("AppSettingsButton").Click();

            var amount = session.Find("GlobalYellowThresholdBox")
                .FindFirstDescendant(query => query.ByControlType(ControlType.Edit));
            Assert.NotNull(amount);
            Assert.Equal("4", amount.AsTextBox().Text);
        });
    }

    [Fact]
    public void Escape_cancels_the_new_project_dialog()
    {
        Run(session =>
        {
            session.Find("NewProjectButton").Click();
            session.TypeInto("DialogInput", "Cancelled Project");

            session.Press(VirtualKeyShort.ESCAPE);
            session.WaitUntil(() => !session.HasControl("DialogInput"), "the new-project dialog to close");

            Assert.True(session.Find("NewProjectButton").Properties.IsEnabled.Value);
            Assert.Null(session.Window.FindFirstDescendant(query => query.ByName("Cancelled Project")));
        });
    }

    private static void Run(Action<SmokeSession> scenario)
    {
        if (Environment.GetEnvironmentVariable("TASKTRACKER_SMOKE") != "1")
        {
            Assert.Skip("Set TASKTRACKER_SMOKE=1 on an interactive Windows desktop.");
        }

        using var session = new SmokeSession();

        try
        {
            scenario(session);
        }
        catch
        {
            session.SaveFailureScreenshot();
            throw;
        }
    }

    private static void CreateProject(SmokeSession session)
    {
        session.Find("NewProjectButton").Click();
        session.TypeInto("DialogInput", "Smoke Project");
        session.Press(VirtualKeyShort.RETURN);
        session.FindText("Smoke Project");
    }

    private static void OpenProject(SmokeSession session)
    {
        CreateProject(session);
        session.Find("OpenProjectButton").Click();
        session.Find("QuickAddBox");
    }

    private static void AddItem(SmokeSession session, string title)
    {
        session.TypeInto("QuickAddBox", title);
        session.Press(VirtualKeyShort.RETURN);
        session.FindNamed("ItemTitleButton", title);
    }

    private static void ReplaceText(SmokeSession session, string automationId, string text)
    {
        session.Find(automationId).Focus();
        session.TypeChord(VirtualKeyShort.CONTROL, VirtualKeyShort.KEY_A);
        Keyboard.Type(text);
    }

    private static bool HasItemRow(SmokeSession session, string title)
    {
        return session.Window.FindAllDescendants(query => query.ByAutomationId("ItemTitleButton"))
            .Any(button => button.Name == title || button.FindFirstDescendant(
                query => query.ByName(title)) is not null);
    }
}