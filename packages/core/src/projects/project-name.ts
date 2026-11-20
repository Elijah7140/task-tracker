import { trimText } from "../text/dotnet-white-space.js";
import { HierarchyError } from "../hierarchy/hierarchy-error.js";

/** Normalize a project or folder name using their shared length limit. */
export function projectName(name: string): string {
  const trimmed = trimText(name);
  if (trimmed.length === 0 || trimmed.length > 300) {
    throw new HierarchyError("Name must be 1 to 300 characters.");
  }
  return trimmed;
}
