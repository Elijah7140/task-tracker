import type { Guid } from "@task-tracker/contracts";
import { Layer } from "effect";
import { Atom, Reactivity } from "effect/reactivity";
import { HISTORY_REPLAY_KEY } from "./history-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

type Id = typeof Guid.Type;

/** Reactivity key invalidated when global settings change. */
export const SETTINGS_KEY = "settings";

/** Reactivity key for the global settings query. */
export const GLOBAL_SETTINGS_KEY = "settings:global";

/** Reactivity key for one project's effective settings and area snapshots. */
export const projectSettingsKey = (projectId: Id) => `settings:project:${projectId}`;

/** Global default settings query. */
export const globalSettingsAtom = TaskTrackerClient.query("LoadGlobalSettings", undefined, {
  reactivityKeys: [HISTORY_REPLAY_KEY, SETTINGS_KEY, GLOBAL_SETTINGS_KEY],
});

/** One project's effective settings with source attribution. */
export const projectSettingsAtom = (projectId: Id) =>
  TaskTrackerClient.query(
    "LoadProjectSettings",
    { projectId },
    { reactivityKeys: [HISTORY_REPLAY_KEY, SETTINGS_KEY, projectSettingsKey(projectId)] },
  );

/** Previews global auto-complete reconciliation counts. */
export const previewGlobalAutoCompleteAtom = TaskTrackerClient.mutation(
  "PreviewGlobalAutoComplete",
);

/** Previews one project's auto-complete reconciliation counts. */
export const previewProjectAutoCompleteAtom = TaskTrackerClient.mutation(
  "PreviewProjectAutoComplete",
);

/** Saves global defaults, returning either `applied` or `needs-confirmation`. */
export const saveGlobalSettingsAtom = TaskTrackerClient.mutation("SaveGlobalSettings");

/** Saves project overrides, returning either `applied` or `needs-confirmation`. */
export const saveProjectSettingsAtom = TaskTrackerClient.mutation("SaveProjectSettings");

const reactivityRuntime = Atom.runtime(Layer.empty);

/**
 * Invalidates reactivity keys after a confirmed settings save applies.
 * Kept separate from `Save*Settings` mutations so unconfirmed previews do not
 * reset unsaved form drafts.
 */
export const invalidateSettingsKeysAtom = reactivityRuntime.fn((keys: ReadonlyArray<string>) =>
  Reactivity.invalidate(keys),
);
