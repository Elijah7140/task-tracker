import { create } from "zustand";

/** A transfer result shown on Home, such as "Exported everything to …". */
export interface TransferStatus {
  readonly id: number;
  readonly message: string;
}

/**
 * Import and export state (§7.9). `running` spans a whole flow, including its
 * dialogs, so only one runs at a time. `working` is true only while an RPC runs
 * and drives the progress bar.
 */
export interface TransferState {
  readonly running: boolean;
  readonly working: boolean;
  readonly status: TransferStatus | null;
}

/** No transfer running and no status, as on launch. */
export const initialTransferState: TransferState = {
  running: false,
  working: false,
  status: null,
};

/** The app's import and export state, shared by Home and later the menu bar. */
export const useTransferStore = create<TransferState>()(() => initialTransferState);

/** Marks a flow as running. Returns false, changing nothing, when one already runs. */
export function beginTransfer(): boolean {
  if (useTransferStore.getState().running) {
    return false;
  }
  useTransferStore.setState({ running: true });
  return true;
}

/** Ends the running flow and any RPC still marked as working. */
export function endTransfer() {
  useTransferStore.setState({ running: false, working: false });
}

/** Shows or hides the progress bar for an RPC of the running flow. */
export function setTransferWorking(working: boolean) {
  useTransferStore.setState({ working });
}

/** Replaces the status line with `message`. */
export function showTransferStatus(message: string) {
  const previous = useTransferStore.getState().status?.id ?? 0;
  useTransferStore.setState({ status: { id: previous + 1, message } });
}
