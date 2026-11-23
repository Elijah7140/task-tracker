import { ADD_TICKETS_HASH, IN_PROGRESS_WINDOW_HASH, TRAY_CARD_HASH } from "@task-tracker/contracts";
import { type FrameGuard, mainFrameGuard } from "./frame-guard.js";
import { createInProgressWindow, type InProgressWindow } from "./in-progress-window.js";
import { createTicketBatchWindow, type TicketBatchWindow } from "./ticket-batch-window.js";
import { createTrayCardWindow, type TrayCardWindow } from "./tray-card-window.js";

/** How the windows beside the app window load their pages. */
export interface AuxiliaryWindowOptions {
  /** The renderer page. Each window adds its own hash. */
  readonly rendererUrl: string;
  /** The app window's narrow preload, shared by every window. */
  readonly preload: string;
  readonly devTools: boolean;
}

/**
 * The windows beside the app window, each with the guard that accepts IPC only
 * from its main frame at its own page.
 */
export interface AuxiliaryWindows {
  /** The in-progress card a left click on the tray icon shows (§7.18). */
  readonly trayCard: TrayCardWindow;
  readonly isTrayCardFrame: FrameGuard;
  /** The card's stack popped out into a window that stays open (§7.18). */
  readonly inProgress: InProgressWindow;
  readonly isInProgressFrame: FrameGuard;
  /** The multi-ticket add window the tray menu opens (§7.20). */
  readonly ticketBatch: TicketBatchWindow;
  readonly isTicketBatchFrame: FrameGuard;
  /** Closes every window without asking. Their pages hold a server connection that ended. */
  readonly destroyAll: () => void;
  /**
   * Closes every window once the app window has closed, so a hidden one does not
   * keep the app running. The add window asks first when it holds unsaved tickets.
   */
  readonly closeWithApp: () => void;
}

export function createAuxiliaryWindows(options: AuxiliaryWindowOptions): AuxiliaryWindows {
  const { rendererUrl, preload, devTools } = options;
  const page = (hash: string) => `${rendererUrl}${hash}`;
  const at = (hash: string) => (url: string) => url === page(hash);
  const trayCard = createTrayCardWindow({ url: page(TRAY_CARD_HASH), preload, devTools });
  const inProgress = createInProgressWindow({
    url: page(IN_PROGRESS_WINDOW_HASH),
    preload,
    devTools,
  });
  const ticketBatch = createTicketBatchWindow({ url: page(ADD_TICKETS_HASH), preload, devTools });

  return {
    trayCard,
    isTrayCardFrame: mainFrameGuard(trayCard.isSender, at(TRAY_CARD_HASH)),
    inProgress,
    isInProgressFrame: mainFrameGuard(inProgress.isSender, at(IN_PROGRESS_WINDOW_HASH)),
    ticketBatch,
    isTicketBatchFrame: mainFrameGuard(ticketBatch.isSender, at(ADD_TICKETS_HASH)),
    destroyAll: () => {
      trayCard.destroy();
      inProgress.destroy();
      ticketBatch.destroy();
    },
    closeWithApp: () => {
      trayCard.destroy();
      inProgress.destroy();
      ticketBatch.close();
    },
  };
}
