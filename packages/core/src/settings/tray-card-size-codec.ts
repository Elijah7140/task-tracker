import type { SettingCodec } from "./setting-codec.js";

/** How big the tray card draws its item cards (§7.18): full workspace size or compact. */
export type TrayCardSize = "Full" | "Compact";

const SIZES: ReadonlyArray<TrayCardSize> = ["Full", "Compact"];

/** Reads the tray card size ignoring case and surrounding space, and writes its name. */
export const trayCardSizeCodec: SettingCodec<TrayCardSize> = {
  parse(text) {
    const wanted = text.trim().toLowerCase();
    const size = SIZES.find((candidate) => candidate.toLowerCase() === wanted);
    if (size === undefined) {
      throw new SyntaxError("Expected Full or Compact.");
    }
    return size;
  },
  format: (value) => value,
};
