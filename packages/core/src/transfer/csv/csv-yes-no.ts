import { nameKey } from "../../metadata/names.js";

const YES = ["yes", "y", "true", "1"].map(nameKey);
const NO = ["no", "n", "false", "0"].map(nameKey);

/** Reads yes/no, y/n, true/false or 1/0 ignoring case, or null for anything else. */
export function parseCsvYesNo(text: string): boolean | null {
  const key = nameKey(text);
  if (YES.includes(key)) {
    return true;
  }
  return NO.includes(key) ? false : null;
}
