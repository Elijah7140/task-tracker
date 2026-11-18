/** A requested hierarchy operation or loaded row violates a tree invariant. */
export class HierarchyError extends Error {
  override readonly name = "HierarchyError";
}
