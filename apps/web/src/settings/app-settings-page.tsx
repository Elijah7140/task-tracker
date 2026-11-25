import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { priorityLevelsAtom } from "../rpc/lookup-queries.js";
import { globalSettingsAtom } from "../rpc/settings-queries.js";
import { statusesAtom } from "../rpc/status-queries.js";
import { buttonClassName } from "../ui/button.js";
import { LoadFailure } from "../ui/load-failure.js";
import { PageContainer } from "../ui/page-container.js";
import { PageHeader } from "../ui/page-header.js";
import { AboutCard } from "./about-card.js";
import { AppearanceCard } from "./appearance-card.js";
import { FieldManagerCard } from "./field-manager-card.js";
import { areaTarget } from "../workspace/area-route.js";
import { GlobalDefaultsCard } from "./global-defaults-card.js";
import { LookupListCard } from "./lookup-list-card.js";
import { StatusListCard } from "./status-list-card.js";
import { TicketListsCard } from "./ticket-lists-card.js";
import { useDesktopInstallation } from "./use-desktop-installation.js";
import { useUnsavedSettingsGuard } from "./use-unsaved-settings-guard.js";

const appSettingsRoute = getRouteApi("/settings");

/**
 * Returns to the project App Settings was opened from, else home (the legacy
 * BackCommand). The unsaved-settings guard still asks before leaving.
 */
function AppSettingsBack() {
  const { returnProjectId } = appSettingsRoute.useSearch();
  const target =
    returnProjectId === undefined ? { to: "/" as const } : areaTarget(returnProjectId, null);
  return (
    <Link {...target} data-testid="app-settings-back" className={buttonClassName("ghost", "sm")}>
      <ArrowLeft size={14} aria-hidden="true" />
      Back
    </Link>
  );
}

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
 * the desktop About card, editable priority level and status lists
 * and the global custom fields.
 */
export function AppSettingsPage() {
  const [dirty, setDirty] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  useUnsavedSettingsGuard(dirty, "Your changes to the global defaults haven't been saved.", () => {
    setDirty(false);
    setDraftVersion((version) => version + 1);
  });

  const installation = useDesktopInstallation();
  const globalSettings = useAtomValue(globalSettingsAtom);
  const priorityLevels = useAtomValue(priorityLevelsAtom);
  const statuses = useAtomValue(statusesAtom);
  const refreshGlobal = useAtomRefresh(globalSettingsAtom);
  const refreshLevels = useAtomRefresh(priorityLevelsAtom);
  const refreshStatuses = useAtomRefresh(statusesAtom);

  const failure = AsyncResult.isFailure(globalSettings)
    ? globalSettings
    : AsyncResult.isFailure(priorityLevels)
      ? priorityLevels
      : AsyncResult.isFailure(statuses)
        ? statuses
        : undefined;

  const retryAll = () => {
    refreshGlobal();
    refreshLevels();
    refreshStatuses();
  };

  return (
    <PageContainer>
      <PageHeader
        title="App Settings"
        description="Global defaults, appearance, priority levels, statuses, ticket lists and custom fields."
        actions={<AppSettingsBack />}
      />
      {failure !== undefined ? (
        <LoadFailure
          message={describeRpcFailure(failure.cause)}
          onRetry={retryAll}
          testId="app-settings-load-failure"
        />
      ) : !AsyncResult.isSuccess(globalSettings) ||
        !AsyncResult.isSuccess(priorityLevels) ||
        !AsyncResult.isSuccess(statuses) ? (
        <SettingsSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          <GlobalDefaultsCard
            key={draftVersion}
            initial={globalSettings.value}
            onDirtyChange={setDirty}
            startWithSystemAvailable={installation?.startWithSystemAvailable}
          />
          <AppearanceCard />
          {installation === undefined ? null : <AboutCard installation={installation} />}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <LookupListCard kind="priorityLevels" rows={priorityLevels.value} />
            <StatusListCard rows={statuses.value} />
          </div>
          <TicketListsCard />
          <FieldManagerCard projectId={null} />
        </div>
      )}
    </PageContainer>
  );
}
