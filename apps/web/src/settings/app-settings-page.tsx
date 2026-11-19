import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { itemTypesAtom, priorityLevelsAtom } from "../rpc/lookup-queries.js";
import { globalSettingsAtom } from "../rpc/settings-queries.js";
import { LoadFailure } from "../ui/load-failure.js";
import { PageContainer } from "../ui/page-container.js";
import { PageHeader } from "../ui/page-header.js";
import { FieldManagerCard } from "./field-manager-card.js";
import { GlobalDefaultsCard } from "./global-defaults-card.js";
import { LookupListCard } from "./lookup-list-card.js";
import { useUnsavedSettingsGuard } from "./use-unsaved-settings-guard.js";

function SettingsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading settings" className="flex flex-col gap-6">
      <div className="h-52 animate-pulse rounded-card bg-hover" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-card bg-hover" />
        <div className="h-64 animate-pulse rounded-card bg-hover" />
      </div>
    </div>
  );
}

/**
 * The App Settings route (`/settings`): global completion and urgency defaults,
 * editable item type and priority level lists and the global custom fields.
 */
export function AppSettingsPage() {
  const [dirty, setDirty] = useState(false);
  useUnsavedSettingsGuard(dirty, "Your changes to the global defaults haven't been saved.");

  const globalSettings = useAtomValue(globalSettingsAtom);
  const itemTypes = useAtomValue(itemTypesAtom);
  const priorityLevels = useAtomValue(priorityLevelsAtom);
  const refreshGlobal = useAtomRefresh(globalSettingsAtom);
  const refreshTypes = useAtomRefresh(itemTypesAtom);
  const refreshLevels = useAtomRefresh(priorityLevelsAtom);

  const failure = AsyncResult.isFailure(globalSettings)
    ? globalSettings
    : AsyncResult.isFailure(itemTypes)
      ? itemTypes
      : AsyncResult.isFailure(priorityLevels)
        ? priorityLevels
        : undefined;

  const retryAll = () => {
    refreshGlobal();
    refreshTypes();
    refreshLevels();
  };

  return (
    <PageContainer>
      <PageHeader
        title="App Settings"
        description="Global defaults, item types, priority levels and custom fields."
      />
      {failure !== undefined ? (
        <LoadFailure
          message={describeRpcFailure(failure.cause)}
          onRetry={retryAll}
          testId="app-settings-load-failure"
        />
      ) : !AsyncResult.isSuccess(globalSettings) ||
        !AsyncResult.isSuccess(itemTypes) ||
        !AsyncResult.isSuccess(priorityLevels) ? (
        <SettingsSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          <GlobalDefaultsCard initial={globalSettings.value} onDirtyChange={setDirty} />
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <LookupListCard kind="itemTypes" rows={itemTypes.value} />
            <LookupListCard kind="priorityLevels" rows={priorityLevels.value} />
          </div>
          <FieldManagerCard projectId={null} />
        </div>
      )}
    </PageContainer>
  );
}
