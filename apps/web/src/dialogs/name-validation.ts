import { trimText } from "@task-tracker/contracts";
import type { PromptValidation } from "../state/dialog-store.js";

/**
 * Longest project, folder and lookup name the server accepts, measured after
 * trimming (the legacy `NameMaxLength`). The server still enforces it.
 */
export const NAME_MAX_LENGTH = 300;

/** The legacy name prompt rules and messages for projects, folders and lookups. */
export const NAME_VALIDATION: PromptValidation = {
  maxLength: NAME_MAX_LENGTH,
  emptyMessage: "Enter a name.",
  tooLongMessage: `Name must be ${NAME_MAX_LENGTH} characters or fewer.`,
};

/** Returns the message for an invalid prompt value, or null when the trimmed value fits. */
export function validatePromptValue(value: string, validation: PromptValidation): string | null {
  const length = trimText(value).length;
  if (length === 0) {
    return validation.emptyMessage;
  }
  return length > validation.maxLength ? validation.tooLongMessage : null;
}
