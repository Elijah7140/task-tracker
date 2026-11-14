using System.Globalization;

using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.Tools;
using FlaUI.Core.WindowsAPI;

using TaskTracker.Core.Fields;

[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace TaskTracker.App.Desktop.SmokeTests;

/// <summary>Exercises the running desktop application through Windows UI Automation.</summary>
public sealed class SmokeTests
{
    private const string ItemWithFields = "Metadata item";
    private static readonly DateTime ReviewDate = new(2026, 11, 20);

    [Fact]
    public void Search_matches_builtin_priority_and_custom_number_then_opens_result()
    {
        Run(session =>
        {
            session.Window.Patterns.Window.Pattern.SetWindowVisualState(WindowVisualState.Maximized);
            CreateProject(session);
            session.Find("AppSettingsButton").Click();
            AddField(session, "Effort", FieldDataType.Number);
            session.Find("AppSettingsBackButton").AsButton().Invoke();
            session.WaitUntil(() => session.HasControl("OpenProjectButton"), "home after settings");
            session.Find("OpenProjectButton").AsButton().Invoke();
            CreateFolderAndSelectIt(session, "Smoke Folder");
            AddItemWithPriorityAndEffort(session, "Priority match", "High", "2");
            AddItemWithPriorityAndEffort(session, "Effort match", "Low", "10");

            session.FindNamed("BreadcrumbButton", "Home").AsButton().Invoke();
            session.Find("HomeSearchButton").AsButton().Invoke();
            AddSearchFilter(session, "Priority", "is");
            session.SelectByName("FilterValueChoiceComboBox", "High");
            session.Find("SearchButton").AsButton().Invoke();
            session.FindText("Priority match");
            Assert.False(session.HasText("Effort match"));

            session.Find("RemoveFilterButton").AsButton().Invoke();
            AddSearchFilter(session, "Effort", "greater than");
            session.TypeInto("FilterValueNumberBox", "5");
            session.Find("SearchButton").AsButton().Invoke();
            session.WaitUntil(() => session.HasText("Effort match") && !session.HasText("Priority match"),
                "the custom number result to replace the priority result");
            var resultRow = session.FindNamed("SearchResultRow", "Effort match");
            session.Window.Focus();
            resultRow.Focus();
            session.WaitUntil(() => resultRow.Properties.HasKeyboardFocus.Value,
                "the search result to have keyboard focus");
            session.Press(VirtualKeyShort.RETURN);

            session.FindNamed("BreadcrumbButton", "Smoke Project");
            session.FindText("Smoke Folder");
            session.FindNamed("ItemTitleButton", "Effort match");
            Assert.Equal("Effort match", session.Find("EditorTitleBox").AsTextBox().Text);
        });
    }

    [Fact]
    public void Custom_fields_of_each_type_persist_after_reopening_the_project()
    {
        Run(session =>
        {
            session.Window.Patterns.Window.Pattern.SetWindowVisualState(WindowVisualState.Maximized);
            CreateProject(session);
            CreateOneFieldOfEachTypeInAppSettings(session);
            session.Find("OpenProjectButton").Click();
            AddItem(session, ItemWithFields);
            session.FindNamed("ItemTitleButton", ItemWithFields).Click();

            FillCustomFields(session);
            SaveAndWaitForEditorReload(session);
            GoHomeAndReopenItem(session, ItemWithFields);

            AssertCustomFieldsAreFilled(session);
        });
    }

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
            CreateFolderAndSelectIt(session, "Smoke Folder");
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
            session.WaitUntil(() => HasItemRow(session, "Updated title") && !HasItemRow(session, "Original title"),
                "the saved title to replace the old one in the item list");

            Assert.True(HasItemRow(session, "Updated title"));
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
        ReplaceText(session, session.Find(automationId), text);
    }

    private static void ReplaceText(SmokeSession session, AutomationElement element, string text)
    {
        element.Focus();
        session.TypeChord(VirtualKeyShort.CONTROL, VirtualKeyShort.KEY_A);
        Keyboard.Type(text);
    }

    /// <summary>The text box inside the editor's custom date picker.</summary>
    private static AutomationElement DatePickerEdit(SmokeSession session)
    {
        var picker = session.Find("EditorCustomDatePicker");

        return picker.FindFirstDescendant(query => query.ByControlType(ControlType.Edit))
            ?? throw new InvalidOperationException("The date picker has no text box.");
    }

    private static void CreateOneFieldOfEachTypeInAppSettings(SmokeSession session)
    {
        session.Find("AppSettingsButton").Click();
        AddField(session, "Summary", FieldDataType.Text);
        AddField(session, "Effort", FieldDataType.Number);
        AddField(session, "Review date", FieldDataType.Date);
        AddField(session, "Approved", FieldDataType.Boolean);
        AddField(session, "Status", FieldDataType.Choice);
        session.TypeInto("ChoiceNewLabelBox", "Ready");
        session.Find("ChoiceAddButton").AsButton().Invoke();
        session.FindText("Choices (1)");
        session.Find("AppSettingsBackButton").AsButton().Invoke();
    }

    /// <summary>Adds a field of the given type and waits until its row appears in the field list.</summary>
    private static void AddField(SmokeSession session, string name, FieldDataType type)
    {
        var rowsBefore = CountFieldRows(session);
        SelectEntry(session, "FieldNewTypeBox", entryCount: Enum.GetValues<FieldDataType>().Length, index: (int)type);
        session.WaitUntil(() => SelectedName(session, "FieldNewTypeBox") == type.ToString(), $"{type} to be selected");
        ReplaceText(session, "FieldNewNameBox", name);
        session.Find("FieldAddButton").AsButton().Invoke();
        session.WaitUntil(() => CountFieldRows(session) == rowsBefore + 1, $"the {name} field row");
    }

    /// <summary>Counts the field rows (not the add row), each of which has its own type list.</summary>
    private static int CountFieldRows(SmokeSession session)
    {
        return session.Window.FindAllDescendants(query => query.ByAutomationId("FieldTypeBox")).Length;
    }

    /// <summary>
    /// Selects an entry of a closed combo box by position, whatever is selected now: it first
    /// presses Up enough times to reach the first entry, then Down <paramref name="index"/> times.
    /// </summary>
    private static void SelectEntry(SmokeSession session, string automationId, int entryCount, int index)
    {
        session.Find(automationId).Focus();

        for (var press = 1; press < entryCount; press++)
        {
            session.Press(VirtualKeyShort.UP);
        }

        for (var press = 0; press < index; press++)
        {
            session.Press(VirtualKeyShort.DOWN);
        }
    }

    private static void CreateFolderAndSelectIt(SmokeSession session, string name)
    {
        var projectName = "Smoke Project";
        var root = session.Find("FolderTree").FindFirstDescendant(query => query.ByName(projectName));
        Assert.NotNull(root);
        root.RightClick();
        session.Find("NewFolderMenuItem").Click();
        session.TypeInto("DialogInput", name);
        session.Press(VirtualKeyShort.RETURN);
        session.WaitUntil(() => session.Find("FolderTree").FindFirstDescendant(
            query => query.ByName(name)) is not null, "the new folder");
        var folder = session.Find("FolderTree").FindFirstDescendant(query => query.ByName(name));
        Assert.NotNull(folder);
        folder.Click();
    }

    private static void AddItemWithPriorityAndEffort(SmokeSession session, string title, string priority, string effort)
    {
        AddItem(session, title);
        session.FindNamed("ItemTitleButton", title).Click();
        session.SelectByName("EditorPriorityBox", priority);
        session.TypeInto("EditorCustomNumberBox", effort);
        var editorBeforeSave = session.Find("EditorCustomNumberBox").Properties.RuntimeId.Value;
        session.Find("EditorSaveButton").AsButton().Invoke();
        session.WaitUntil(() => NumberEditorWasReplaced(session, editorBeforeSave),
            $"{title} to finish saving");
    }

    private static void AddSearchFilter(SmokeSession session, string fieldName, string operatorName)
    {
        session.Find("AddFilterButton").AsButton().Invoke();
        session.SelectByName("FilterFieldComboBox", fieldName);
        session.SelectByName("FilterOperatorComboBox", operatorName);
    }

    private static void FillCustomFields(SmokeSession session)
    {
        ReplaceText(session, "EditorCustomTextBox", "Review database");
        ReplaceText(session, "EditorCustomNumberBox", FormatNumber(12.5));
        ReplaceText(session, DatePickerEdit(session), FormatDate(ReviewDate));
        session.Press(VirtualKeyShort.TAB);
        SelectEntry(session, "EditorCustomBooleanBox", entryCount: 3, index: 1);
        SelectEntry(session, "EditorCustomChoiceBox", entryCount: 2, index: 1);
    }

    /// <summary>
    /// Saves the item and waits until the save has finished. After a successful save the editor's
    /// custom inputs are rebuilt from the database, so a new text box means the save is complete.
    /// </summary>
    private static void SaveAndWaitForEditorReload(SmokeSession session)
    {
        var before = session.Find("EditorCustomTextBox").Properties.RuntimeId.Value;

        session.Find("EditorSaveButton").AsButton().Invoke();

        session.WaitUntil(() => EditorTextBoxWasReplaced(session, before), "the editor to reload after saving");
    }

    private static bool EditorTextBoxWasReplaced(SmokeSession session, int[] previousRuntimeId)
    {
        var current = session.Window.FindFirstDescendant(query => query.ByAutomationId("EditorCustomTextBox"));
        var runtimeId = current?.Properties.RuntimeId.ValueOrDefault;

        return runtimeId is not null && !previousRuntimeId.SequenceEqual(runtimeId);
    }

    private static bool NumberEditorWasReplaced(SmokeSession session, int[] previousRuntimeId)
    {
        var current = session.Window.FindFirstDescendant(query => query.ByAutomationId("EditorCustomNumberBox"));
        var runtimeId = current?.Properties.RuntimeId.ValueOrDefault;
        return runtimeId is not null && !previousRuntimeId.SequenceEqual(runtimeId);
    }

    private static void GoHomeAndReopenItem(SmokeSession session, string title)
    {
        session.FindNamed("BreadcrumbButton", "Home").Click();
        session.Find("OpenProjectButton").Click();
        session.FindNamed("ItemTitleButton", title).Click();
    }

    private static void AssertCustomFieldsAreFilled(SmokeSession session)
    {
        var number = session.Find("EditorCustomNumberBox").AsTextBox().Text;
        var date = DatePickerEdit(session).AsTextBox().Text;

        Assert.Equal("Review database", session.Find("EditorCustomTextBox").AsTextBox().Text);
        Assert.Equal(FormatNumber(12.5), number);
        Assert.Equal(FormatDate(ReviewDate), date);
        Assert.Equal("Yes", SelectedName(session, "EditorCustomBooleanBox"));
        Assert.Equal("Ready", SelectedName(session, "EditorCustomChoiceBox"));
    }

    private static string SelectedName(SmokeSession session, string automationId)
    {
        return session.Find(automationId).AsComboBox().SelectedItem?.Name ?? "(nothing selected)";
    }

    private static string FormatNumber(double value)
    {
        return value.ToString(CultureInfo.CurrentCulture);
    }

    private static string FormatDate(DateTime value)
    {
        return value.ToString("d", CultureInfo.CurrentCulture);
    }

    private static bool HasItemRow(SmokeSession session, string title)
    {
        return session.Window.FindAllDescendants(query => query.ByAutomationId("ItemTitleButton"))
            .Any(button => button.Name == title || button.FindFirstDescendant(
                query => query.ByName(title)) is not null);
    }
}