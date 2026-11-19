import { useActiveDialog } from "../state/dialog-store.js";
import { ConfirmDialog } from "./confirm-dialog.js";
import { MessageDialog } from "./message-dialog.js";
import { PromptDialog } from "./prompt-dialog.js";

/** Renders the first queued dialog. Mount once at the app root. */
export function DialogHost() {
  const request = useActiveDialog();
  switch (request?.kind) {
    case undefined:
      return null;
    case "confirm":
      return <ConfirmDialog key={request.id} id={request.id} options={request.options} />;
    case "prompt":
      return <PromptDialog key={request.id} id={request.id} options={request.options} />;
    case "message":
      return <MessageDialog key={request.id} id={request.id} options={request.options} />;
  }
}
