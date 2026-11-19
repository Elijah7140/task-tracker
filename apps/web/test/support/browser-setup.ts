import { beforeEach } from "vitest";
import { configure } from "vitest-browser-react/pure";
import "../../src/styles.css";
import { dialogStore } from "../../src/state/dialog-store.js";
import { useThemeStore } from "../../src/state/theme-store.js";

configure({ reactStrictMode: true });

beforeEach(() => {
  localStorage.clear();
  dialogStore.setState({ queue: [], nextId: 1 });
  useThemeStore.setState({ preference: "light" });
  delete document.documentElement.dataset["theme"];
});
