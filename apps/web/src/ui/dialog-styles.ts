/**
 * Shared classes for every modal surface (confirm, prompt, message and later
 * editors) so dialogs look the same across screens.
 */
export const dialogStyles = {
  backdrop:
    "fixed inset-0 bg-backdrop transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
  popup:
    "fixed top-[38%] left-1/2 flex w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-dialog border border-line bg-raised p-5 text-fg shadow-raised outline-none transition-[scale,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
  header: "flex flex-col gap-1.5",
  title: "text-base font-semibold tracking-tight",
  description: "text-sm leading-relaxed text-fg-muted",
  footer: "flex justify-end gap-2 pt-1",
} as const;
