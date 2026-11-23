/** The parts of an IPC event that identify where a call came from. */
export type FrameEvent = Pick<Electron.IpcMainInvokeEvent, "sender" | "senderFrame">;

/** Decides whether a native handler may trust an IPC call. */
export type FrameGuard = (event: FrameEvent) => boolean;

/**
 * Builds the check a native handler runs before it trusts an IPC call (§4). The
 * call must come from the main frame of the window `ownsSender` knows, while
 * that frame shows a page `isPage` accepts. Embedded frames, other windows and
 * pages navigated elsewhere are refused.
 */
export function mainFrameGuard(
  ownsSender: (contents: Electron.WebContents) => boolean,
  isPage: (url: string) => boolean,
): FrameGuard {
  return (event) => {
    const frame = event.senderFrame;
    return ownsSender(event.sender) && frame?.parent === null && isPage(frame.url);
  };
}
