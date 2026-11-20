import { beforeEach } from "vitest";
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
import { useThemeStore } from "../../src/state/theme-store.js";
import { initialTransferState, useTransferStore } from "../../src/state/transfer-store.js";
import { initialWorkspaceState, useWorkspaceStore } from "../../src/state/workspace-store.js";

configure({ reactStrictMode: true });

beforeEach(() => {
  localStorage.clear();
  dialogStore.setState({ queue: [], nextId: 1 });
  useThemeStore.setState({ preference: "light" });
  useWorkspaceStore.setState(initialWorkspaceState);
  useItemEditorStore.setState(initialItemEditorState);
  useReturnPageStore.setState(initialReturnPageState);
  useReminderPanelStore.setState(initialReminderPanelState);
  useTransferStore.setState(initialTransferState);
  appUpdateStore.setState(initialAppUpdateValues);
  delete document.documentElement.dataset["theme"];
});
