/** Resolves the open editor's unsaved draft; false means the user cancelled or saving failed. */
type DraftGuard = () => Promise<boolean>;

let currentGuard: DraftGuard | null = null;

/**
 * Lets the open item editor answer {@link resolveEditorDraft}. Returns the
 * function that removes the registration when the editor closes.
 */
export function registerEditorDraftGuard(guard: DraftGuard): () => void {
  currentGuard = guard;
  return () => {
    if (currentGuard === guard) {
      currentGuard = null;
    }
  };
}

/**
 * Runs the open editor's unsaved-changes question, as item moves do before
 * they save (§7.5). Resolves true when no editor is open or the draft is clean.
 */
export function resolveEditorDraft(): Promise<boolean> {
  return currentGuard?.() ?? Promise.resolve(true);
}
