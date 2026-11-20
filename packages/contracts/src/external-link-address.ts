import { trimText } from "./dotnet-white-space.js";

const maxLength = 2_000;
const forbiddenCharacters = /[\p{White_Space}\p{Cc}]/u;
const webAddress = /^https?:\/\/[^/\\?#]+/i;

/** Returns a trimmed absolute address eligible for the OS link launcher. */
export function externalLinkAddress(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const address = trimText(value);
  if (address.length > maxLength || forbiddenCharacters.test(address)) {
    return undefined;
  }
  const url = URL.parse(address);
  if (url?.protocol === "mailto:") {
    return address;
  }
  if (webAddress.test(address) && !address.includes("\\") && url?.hostname) {
    return address;
  }
  return undefined;
}
