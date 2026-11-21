/**
 * Asks Electron main to open the item in the main window, as clicking a row of
 * the tray card or the popped-out in-progress window does (§7.18). Main hides
 * the tray card and validates the ID and the sending window. Outside Electron
 * there is no tray card.
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
