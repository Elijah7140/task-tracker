import { afterEach, beforeEach } from "vitest";
import { configure } from "vitest-browser-react/pure";
import "../../src/styles.css";
import { appUpdateStore, initialAppUpdateValues } from "../../src/state/app-update-store.js";
import { dialogStore } from "../../src/state/dialog-store.js";
import { initialItemEditorState, useItemEditorStore } from "../../src/state/item-editor-store.js";
import {
  initialReminderPanelState,
  useReminderPanelStore,
} from "../../src/state/reminder-panel-store.js";
import { initialReturnPageState, useReturnPageStore } from "../../src/state/return-page-store.js";
import { useSidebarStore } from "../../src/state/sidebar-store.js";
import { useThemeStore } from "../../src/state/theme-store.js";
import { initialTransferState, useTransferStore } from "../../src/state/transfer-store.js";
import { initialWorkspaceState, useWorkspaceStore } from "../../src/state/workspace-store.js";
import { expectOnlyBundledFonts } from "./platform-fonts.js";

configure({ reactStrictMode: true });

beforeEach(() => {
  localStorage.clear();
  dialogStore.setState({ queue: [], nextId: 1 });
  useThemeStore.setState({ preference: "light" });
  // Most screens are tested with the folder tree showing; sidebar tests cover the collapsed default.
  useSidebarStore.setState({ expanded: true });
  useWorkspaceStore.setState(initialWorkspaceState);
  useItemEditorStore.setState(initialItemEditorState);
  useReturnPageStore.setState(initialReturnPageState);
  useReminderPanelStore.setState(initialReminderPanelState);
  useTransferStore.setState(initialTransferState);
  appUpdateStore.setState(initialAppUpdateValues);
  delete document.documentElement.dataset["theme"];
});

// Screens must not depend on installed system fonts, which differ between machines.
afterEach(async () => {
  await expectOnlyBundledFonts();
});
