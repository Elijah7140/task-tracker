import { externalLinkAddress } from "@task-tracker/contracts";
import { notify } from "../state/dialog-store.js";

/** Hands an eligible address to the system handler without navigating the app. */
export async function openExternalLink(value: string) {
  const address = externalLinkAddress(value);
  if (address === undefined) {
    return;
  }
  const opened = await window.taskTrackerDesktop?.openExternalLink(address).catch(() => false);
  if (opened !== true) {
    await notify({
      title: "Could not open link",
      message: `The link could not be opened: ${address}`,
    });
  }
}
