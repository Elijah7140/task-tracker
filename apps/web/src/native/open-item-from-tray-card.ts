/**
 * Asks Electron main to hide the tray card and open the item in the main
 * window, as the card's Open in Task Tracker does (§7.18). Main validates the
 * ID and the sending window. Outside Electron there is no tray card.
 */
export async function openItemFromTrayCard(itemId: string): Promise<boolean> {
  const open = window.taskTrackerDesktop?.openItemFromTrayCard;
  if (open === undefined) {
    return false;
  }
  try {
    return await open(itemId);
  } catch {
    return false;
  }
}
