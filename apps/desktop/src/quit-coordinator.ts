import type { ServerExit, ServerProcess, ServerStop } from "./server-process.js";

/** What the quit coordinator needs from Electron main. */
export interface QuitCoordinatorOptions {
  /** The running server child, or nothing once it has stopped. */
  readonly server: () => ServerProcess | undefined;
  /** Reports how the server stopped. The server is gone when this returns. */
  readonly onServerStopped: (stop: ServerStop, exit: ServerExit) => void;
  /** Runs when a quit goes ahead with no server left to stop. */
  readonly onQuit: () => void;
  /** Asks Electron to quit, which reaches `beforeQuit` again. */
  readonly quit: () => void;
  /** Brings the running app forward for a second launch. */
  readonly showWindow: () => void;
  /** Starts the app again once this process has exited. */
  readonly relaunchAfterQuit: () => void;
}

/** Electron's quit, session-end and second-launch handling for one app instance. */
export interface QuitCoordinator {
  /** Whether the app is quitting, so a window close is not the user's and no dialog opens. */
  readonly quitting: () => boolean;
  /** Electron's `before-quit` listener. Holds the quit until the server has closed its database. */
  readonly beforeQuit: (event: Pick<Electron.Event, "preventDefault">) => void;
  /**
   * Quits because the OS session is ending. Windows ends the process soon after,
   * so the server is asked to stop at once rather than left to be killed.
   */
  readonly endSession: () => void;
  /**
   * Electron's `second-instance` listener. The quitting instance keeps the
   * single-instance lock until its server has stopped, so a launch during that
   * window starts the app again once the quit finishes.
   */
  readonly onSecondInstance: () => void;
}

export function createQuitCoordinator(options: QuitCoordinatorOptions): QuitCoordinator {
  let quitting = false;
  let sessionEnding = false;
  let relaunchScheduled = false;

  const beforeQuit: QuitCoordinator["beforeQuit"] = (event) => {
    const child = options.server();
    if (child === undefined) {
      quitting = true;
      options.onQuit();
      return;
    }
    event.preventDefault();
    if (quitting) {
      return;
    }
    quitting = true;
    void child.stop().then(async (stop) => {
      options.onServerStopped(stop, await child.closed);
      options.quit();
    });
  };

  return {
    quitting: () => quitting || sessionEnding,
    beforeQuit,
    endSession: () => {
      sessionEnding = true;
      options.quit();
    },
    onSecondInstance: () => {
      if (!quitting && !sessionEnding) {
        options.showWindow();
      } else if (!relaunchScheduled) {
        relaunchScheduled = true;
        options.relaunchAfterQuit();
      }
    },
  };
}
