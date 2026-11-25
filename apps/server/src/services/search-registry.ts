import {
  isBuiltInSearchField,
  listSearchableFields,
  listSearchChoices,
  MetadataRuleError,
  type ItemQuery,
  type QueryValidationContext,
  type SearchableField,
  type SearchChoice,
  type SearchScope,
} from "@task-tracker/core";
import { Effect, Option } from "effect";
import type { SqlClient } from "effect/sql";
import { fieldRepository } from "../db/repositories/field-repository.js";
import { folderRepository } from "../db/repositories/folder-repository.js";
import { lookupRepository } from "../db/repositories/lookup-repository.js";
import { projectRepository } from "../db/repositories/project-repository.js";

const NO_CHOICES = { priorityLevels: [], choices: [] } as const;

/**
 * Loads the field registry, choices and scope checks for search on the caller's
 * transaction (§7.2). Core decides which fields and choices apply.
 */
export function searchRegistry(sql: SqlClient.SqlClient) {
  const projects = projectRepository(sql);
  const folders = folderRepository(sql);
  const fields = fieldRepository(sql);
  const lookups = lookupRepository(sql);

  /** Rejects a deleted or missing scope project, or a folder outside it. */
  const validateScope = Effect.fnUntraced(function* (scope: SearchScope) {
    if (scope.kind === "allProjects") {
      return;
    }
    if (Option.isNone(yield* projects.findActive(scope.projectId))) {
      return yield* Effect.fail(new MetadataRuleError("Search project does not exist."));
    }
    if (scope.kind !== "area" || scope.folderId === null) {
      return;
    }
    const projectFolders = yield* folders.listActive(scope.projectId);
    if (!projectFolders.some((folder) => folder.id === scope.folderId)) {
      return yield* Effect.fail(
        new MetadataRuleError("Search folder does not exist in the project."),
      );
    }
  });

  const listFields = Effect.fnUntraced(function* (scope: SearchScope) {
    const definitions = yield* fields.definitions.list();
    const activeProjects = yield* projects.listActive();
    return listSearchableFields(scope, definitions, activeProjects);
  });

  const findField = Effect.fnUntraced(function* (scope: SearchScope, fieldKey: string) {
    const found = (yield* listFields(scope)).find((field) => field.key === fieldKey);
    return found ?? (yield* Effect.fail(unknownField(fieldKey)));
  });

  const listChoices = Effect.fnUntraced(function* (field: SearchableField) {
    if (isBuiltInSearchField(field) && field.key === "priority") {
      const priorityLevels = yield* lookups.priorityLevels.list();
      return listSearchChoices(field, { ...NO_CHOICES, priorityLevels });
    }
    if (field.fieldDefinitionId === null || field.dataType !== "Choice") {
      return [] as ReadonlyArray<SearchChoice>;
    }
    const choices = yield* fields.choices.list(field.fieldDefinitionId);
    return listSearchChoices(field, { ...NO_CHOICES, choices });
  });

  /** Collects the fields in scope and the choices of each choice field the query filters. */
  const validationContext = Effect.fnUntraced(function* (query: ItemQuery) {
    const scopeFields = yield* listFields(query.scope);
    const filtered = new Set(query.filters.map((filter) => filter.fieldKey));
    const choiceFields = scopeFields.filter(
      (field) => field.dataType === "Choice" && filtered.has(field.key),
    );
    const choices = yield* Effect.forEach(choiceFields, (field) =>
      listChoices(field).pipe(Effect.map((options) => [field.key, options] as const)),
    );
    return {
      fields: scopeFields,
      choicesByFieldKey: new Map(choices),
    } satisfies QueryValidationContext;
  });

  return { validateScope, listFields, findField, listChoices, validationContext };
}

function unknownField(fieldKey: string) {
  return new MetadataRuleError(`Unknown search field '${fieldKey}'.`);
}
