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
    [Fact]
    public void Item_drag_keyboard_indent_and_folder_move_survive_reopen()
    {
        Run(session =>
        {
            session.Window.Patterns.Window.Pattern.SetWindowVisualState(WindowVisualState.Maximized);
            OpenProject(session);
            AddItem(session, "Parent item");
            AddItem(session, "Dragged item");
            var dragged = session.FindNamed("ItemTitleButton", "Dragged item");
            var parent = session.FindNamed("ItemTitleButton", "Parent item");
            Mouse.Drag(dragged.BoundingRectangle.Center(), parent.BoundingRectangle.Center());
            session.WaitUntil(() => IsIndented(session, "Dragged item", "Parent item"),
                "dragged item to nest");

            AddItem(session, "Keyboard child");
            session.FindNamed("ItemTitleButton", "Keyboard child").Click();
            session.TypeChord(VirtualKeyShort.ALT, VirtualKeyShort.RIGHT);
            session.WaitUntil(() => IsIndented(session, "Keyboard child", "Parent item"),
                "keyboard item to nest");

            CreateFolderAndSelectIt(session, "Destination");
            session.FindNamed("BreadcrumbButton", "Smoke Project").AsButton().Invoke();
            session.WaitUntil(() => HasItemRow(session, "Parent item"), "project root area to load");
            parent = session.FindNamed("ItemTitleButton", "Parent item");
            var folder = session.FindNamed("FolderTreeItem", "Destination");
            Mouse.Drag(parent.BoundingRectangle.Center(), folder.BoundingRectangle.Center());
            session.WaitUntil(() => session.Find("SelectedAreaHeading").Name == "Destination", "the move to follow into Destination");
            session.FindNamed("BreadcrumbButton", "Home").AsButton().Invoke();
            session.Find("OpenProjectButton").AsButton().Invoke();
            session.FindNamed("FolderTreeItem", "Destination").Click();
            session.WaitUntil(() => HasItemRow(session, "Parent item"), "the reopened Destination area");

            AssertChildrenBeneathParent(session, "Parent item", "Dragged item", "Keyboard child");
        });
    }

    private const string ItemWithFields = "Metadata item";
    private static readonly DateTime ReviewDate = new(2026, 11, 20);

    [Fact]
    public void Calendar_shows_due_and_scheduled_items_and_opens_one()
    {
        Run(session =>
        {
            session.Window.Patterns.Window.Pattern.SetWindowVisualState(WindowVisualState.Maximized);
            var seededDay = DateTime.Today;
            OpenProject(session);
            AddItem(session, "Calendar due item");
            session.FindNamed("ItemTitleButton", "Calendar due item").Click();
            ReplaceText(session, PickerEdit(session, "EditorDueDatePicker"), FormatDate(seededDay));
            session.Press(VirtualKeyShort.TAB);
            session.Find("EditorSaveButton").AsButton().Invoke();

            AddItem(session, "Calendar scheduled item");
            session.FindNamed("ItemTitleButton", "Calendar scheduled item").Click();
            ReplaceText(session, PickerEdit(session, "EditorStartDatePicker"), FormatDate(seededDay));
            session.Press(VirtualKeyShort.TAB);
            session.Find("EditorSaveButton").AsButton().Invoke();

            session.Find("WorkspaceCalendarButton").AsButton().Invoke();
            session.SelectByName("CalendarScopeComboBox", "This project");
            session.FindText("Calendar due item");
            session.FindText("00:00 Calendar scheduled item");
            session.Find("CalendarNextButton").AsButton().Invoke();
            session.Find("CalendarPreviousButton").AsButton().Invoke();
            session.Find("CalendarTodayButton").AsButton().Invoke();
            session.FindText("Calendar due item");
            session.Find("CalendarWeekButton").AsButton().Invoke();
            session.FindText("Calendar due item");
            session.FindText("Calendar scheduled item");
            session.FindNamed("CalendarEntryButton", "Calendar due item").AsButton().Invoke();
            Assert.Equal("Calendar due item", session.Find("EditorTitleBox").AsTextBox().Text);
        });
    }

    [Fact]
    public void Calendar_entry_moves_with_Alt_arrow_keys_and_the_item_shows_the_new_date()
    {
        Run(session =>
        {
            session.Window.Patterns.Window.Pattern.SetWindowVisualState(WindowVisualState.Maximized);
            var today = DateTime.Today;
            OpenCalendarWithDueItem(session, "Keyboard move item", today);

            session.FindNamed("CalendarEntryButton", "Keyboard move item").Focus();
            session.TypeChord(VirtualKeyShort.ALT, VirtualKeyShort.RIGHT);
            session.WaitUntil(() => IsInCalendarCell(session, "Keyboard move item", today.AddDays(1)),
                "the entry to move to tomorrow");
            session.TypeChord(VirtualKeyShort.ALT, VirtualKeyShort.RIGHT);
            session.WaitUntil(() => IsInCalendarCell(session, "Keyboard move item", today.AddDays(2)),
                "the entry to move one more day");

            session.FindNamed("CalendarEntryButton", "Keyboard move item").AsButton().Invoke();
            var shownDate = PickerEdit(session, "EditorDueDatePicker").AsTextBox().Text;
            Assert.Equal(FormatDate(today.AddDays(2)), shownDate);
        });
    }

    [Fact]
    public void Calendar_entry_moves_with_a_real_mouse_drag_and_the_item_shows_the_new_date()
    {
        Run(session =>
        {
            session.Window.Patterns.Window.Pattern.SetWindowVisualState(WindowVisualState.Maximized);
            var today = DateTime.Today;
            OpenCalendarWithDueItem(session, "Mouse move item", today);
            var entry = session.FindNamed("CalendarEntryButton", "Mouse move item");
            var targetCell = session.FindNamed("CalendarDayCell", today.AddDays(2).ToString("yyyy-MM-dd"));

            Mouse.Drag(entry.BoundingRectangle.Center(), targetCell.BoundingRectangle.Center());
            session.WaitUntil(() => IsInCalendarCell(session, "Mouse move item", today.AddDays(2)),
                "the entry to land two days later");

            session.FindNamed("CalendarEntryButton", "Mouse move item").AsButton().Invoke();
            var shownDate = PickerEdit(session, "EditorDueDatePicker").AsTextBox().Text;
            Assert.Equal(FormatDate(today.AddDays(2)), shownDate);
        });
    }

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
    public void Query_syntax_search_can_be_saved_and_reopened_from_home()
    {
        const string query = "title~invoice no:ticket";

        Run(session =>
        {
            session.Window.Patterns.Window.Pattern.SetWindowVisualState(WindowVisualState.Maximized);
            OpenProject(session);
            AddItem(session, "Invoice review");
            AddItem(session, "Other task");
            session.FindNamed("BreadcrumbButton", "Home").AsButton().Invoke();
            session.Find("HomeSearchButton").AsButton().Invoke();

            session.TypeInto("SearchTextBox", query);
            session.Press(VirtualKeyShort.RETURN);
            session.WaitUntil(() => session.HasText("Invoice review") && !session.HasText("Other task"),
                "the syntax query to show only the invoice item");
            session.Find("SaveSearchButton").AsButton().Invoke();
            session.TypeInto("DialogInput", "Invoices");
            session.Press(VirtualKeyShort.RETURN);
            session.FindNamed("SavedSearchChip", "Invoices");

            session.Find("SearchBackButton").AsButton().Invoke();
            session.FindNamed("SavedSearchLink", "Invoices").AsButton().Invoke();

            session.WaitUntil(() => session.HasText("Invoice review") && !session.HasText("Other task"),
                "the saved search to run from Home");
            Assert.Equal(query, session.Find("SearchTextBox").AsTextBox().Text);
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
    public void Trash_restores_an_item_and_permanently_deletes_a_folder()
    {
        Run(session =>
        {
            OpenProject(session);
            AddItem(session, "Restore me");
            DeleteSelectedItem(session, "Restore me");
            CreateFolderAndSelectIt(session, "Doomed folder");
            DeleteFolder(session, "Doomed folder");

            session.Find("WorkspaceTrashButton").AsButton().Invoke();
            session.WaitUntil(() => HasTrashRow(session, "Restore me") && HasTrashRow(session, "Doomed folder"),
                "both deleted nodes to be listed in the trash");
            ClickTrashRowButton(session, "Restore me", "RestoreBatchButton");
            session.WaitUntil(() => !HasTrashRow(session, "Restore me"), "the restored item to leave the trash");
            ClickTrashRowButton(session, "Doomed folder", "PurgeBatchButton");
            session.Find("DialogConfirmButton").AsButton().Invoke();
            session.WaitUntil(() => !HasTrashRow(session, "Doomed folder"), "the purged folder to leave the trash");
            session.FindText("The trash is empty.");

            session.Find("TrashBackButton").AsButton().Invoke();
            session.WaitUntil(() => HasItemRow(session, "Restore me"), "the restored item to show in the workspace");
            Assert.Null(session.Find("FolderTree").FindFirstDescendant(query => query.ByName("Doomed folder")));
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

    /// <summary>Creates a project with one item due on the date and opens the month calendar of that project.</summary>
    private static void OpenCalendarWithDueItem(SmokeSession session, string title, DateTime due)
    {
        OpenProject(session);
        AddItem(session, title);
        session.FindNamed("ItemTitleButton", title).Click();
        ReplaceText(session, PickerEdit(session, "EditorDueDatePicker"), FormatDate(due));
        session.Press(VirtualKeyShort.TAB);
        session.Find("EditorSaveButton").AsButton().Invoke();
        session.Find("WorkspaceCalendarButton").AsButton().Invoke();
        session.SelectByName("CalendarScopeComboBox", "This project");
        session.FindNamed("CalendarEntryButton", title);
    }

    /// <summary>True when the entry button sits inside the month cell of the given day.</summary>
    private static bool IsInCalendarCell(SmokeSession session, string title, DateTime day)
    {
        var cell = session.Window.FindAllDescendants(query => query.ByAutomationId("CalendarDayCell"))
            .FirstOrDefault(candidate => candidate.Name == day.ToString("yyyy-MM-dd"));
        var entry = cell?.FindFirstDescendant(query => query.ByAutomationId("CalendarEntryButton"));
        return entry is not null && entry.Name == title;
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
        return PickerEdit(session, "EditorCustomDatePicker");
    }

    private static AutomationElement PickerEdit(SmokeSession session, string automationId)
    {
        var picker = session.Find(automationId);

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

    private static void DeleteSelectedItem(SmokeSession session, string title)
    {
        session.FindNamed("ItemTitleButton", title).Click();
        session.Press(VirtualKeyShort.DELETE);
        session.Find("DialogConfirmButton");
        session.Press(VirtualKeyShort.RETURN);
        session.WaitUntil(() => !session.HasControl("DialogConfirmButton") && !HasItemRow(session, title),
            $"{title} to be deleted");
    }

    private static void DeleteFolder(SmokeSession session, string name)
    {
        var folder = session.Find("FolderTree").FindFirstDescendant(query => query.ByName(name));
        Assert.NotNull(folder);
        folder.RightClick();
        session.Find("DeleteFolderMenuItem").Click();
        session.Find("DialogConfirmButton");
        session.Press(VirtualKeyShort.RETURN);
        session.WaitUntil(() => !session.HasControl("DialogConfirmButton") && session.Find("FolderTree")
            .FindFirstDescendant(query => query.ByName(name)) is null, $"folder {name} to be deleted");
    }

    private static bool HasTrashRow(SmokeSession session, string title)
    {
        return session.Window.FindAllDescendants(query => query.ByAutomationId("TrashBatchRow"))
            .Any(row => row.Name == title || row.FindFirstDescendant(query => query.ByName(title)) is not null);
    }

    private static void ClickTrashRowButton(SmokeSession session, string title, string buttonId)
    {
        var row = session.FindNamed("TrashBatchRow", title);
        var button = row.FindFirstDescendant(query => query.ByAutomationId(buttonId));
        Assert.NotNull(button);
        button.AsButton().Invoke();
    }

    private static bool HasItemRow(SmokeSession session, string title)
    {
        return session.Window.FindAllDescendants(query => query.ByAutomationId("ItemTitleButton"))
            .Any(button => button.Name == title || button.FindFirstDescendant(
                query => query.ByName(title)) is not null);
    }

    private static bool IsIndented(SmokeSession session, string child, string parent)
    {
        var childButton = session.Window.FindAllDescendants(query => query.ByAutomationId("ItemTitleButton"))
            .FirstOrDefault(button => button.Name == child);
        var parentButton = session.Window.FindAllDescendants(query => query.ByAutomationId("ItemTitleButton"))
            .FirstOrDefault(button => button.Name == parent);

        return childButton is not null && parentButton is not null &&
            childButton.BoundingRectangle.Left > parentButton.BoundingRectangle.Left + 15;
    }

    private static List<AutomationElement> TitleButtons(SmokeSession session)
    {
        return session.Window.FindAllDescendants(query => query.ByAutomationId("ItemTitleButton")).ToList();
    }

    /// <summary>
    /// With the parent expanded, the area must show exactly the parent followed by its children,
    /// each indented under it. Only these rows exist in the area, so a child that was not
    /// re-parented would appear unindented or elsewhere.
    /// </summary>
    private static void AssertChildrenBeneathParent(SmokeSession session, string parent, params string[] children)
    {
        session.Find("ItemExpandButton").Click();
        session.WaitUntil(() => TitleButtons(session).Count == children.Length + 1, "the sub-items to show");
        var rows = TitleButtons(session).OrderBy(button => button.BoundingRectangle.Top).ToList();
        var parentLeft = rows[0].BoundingRectangle.Left;
        var childLeft = rows[1].BoundingRectangle.Left;

        Assert.Equal(parent, rows[0].Name);
        Assert.Equal(children.Order(), rows.Skip(1).Select(button => button.Name).Order());
        Assert.All(rows.Skip(1), child => Assert.True(child.BoundingRectangle.Left > parentLeft + 15));
        Assert.All(rows.Skip(1), child => Assert.InRange(child.BoundingRectangle.Left,
            childLeft - 2, childLeft + 2));
    }
}