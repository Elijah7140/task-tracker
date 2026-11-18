export { HierarchyError } from "./hierarchy/hierarchy-error.js";
export { ItemTree } from "./items/item-tree.js";
export type { TodoItem } from "./items/todo-item.js";
export type { Folder } from "./projects/folder.js";
export { FolderTree } from "./projects/folder-tree.js";
export type { Project } from "./projects/project.js";
export * as CompletionService from "./completion/completion-service.js";
export type {
  AppliedCompletion,
  CompletionChange,
  CompletionResult,
} from "./completion/completion-result.js";
export type { ReconciliationPreview } from "./completion/reconciliation-preview.js";
export {
  archiveChoice,
  createChoice,
  renameChoice,
  reorderChoices,
  restoreChoice,
  type FieldChoice,
} from "./fields/field-choice.js";
export type { FieldDataType } from "./fields/field-data-type.js";
export {
  archiveField,
  changeFieldType,
  createField,
  effectiveFields,
  listFields,
  renameField,
  reorderFields,
  restoreField,
  type FieldDefinition,
} from "./fields/field-definition.js";
export { planFieldValueEdits, type FieldValueEdits } from "./fields/field-value-edits.js";
export type { FieldValueInput } from "./fields/field-value-input.js";
export { validateFieldValue } from "./fields/field-value-validator.js";
export type { ItemFieldValue } from "./fields/item-field-value.js";
export { builtInItemTypes, builtInPriorityLevels } from "./lookups/built-in-lookups.js";
export type { ItemType } from "./lookups/item-type.js";
export type { LookupEntity } from "./lookups/lookup-entity.js";
export {
  activeLookups,
  archiveLookup,
  comparePriority,
  createItemType,
  createPriorityLevel,
  renameLookup,
  reorderLookups,
  restoreLookup,
} from "./lookups/lookup.js";
export type { PriorityLevel } from "./lookups/priority-level.js";
export { MetadataRuleError } from "./metadata/metadata-rule-error.js";
