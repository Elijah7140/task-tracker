/** A requested entity is missing or deleted in the current scope. */
export class EntityMissing extends Error {
  override readonly name = "EntityMissing";

  constructor(
    readonly entity: "Project" | "Folder" | "Item" | "DeletionBatch" | "Field" | "Choice",
    message = `${entity} is missing or deleted.`,
  ) {
    super(message);
  }
}
