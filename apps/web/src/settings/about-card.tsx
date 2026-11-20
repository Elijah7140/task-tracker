import { useEffect } from "react";
import { useStore } from "zustand";
import type { DesktopInstallationInfo } from "../native/desktop-installation.js";
import { useRunReturnGuards } from "../shell/return-guards.js";
import { appUpdateStore, UPDATE_TEXT } from "../state/app-update-store.js";
import { Button } from "../ui/button.js";
import { SectionCard } from "../ui/section-card.js";

/** Props for {@link AboutCard}. */
export interface AboutCardProps {
  readonly installation: DesktopInstallationInfo;
}

/** Download and Restart to update, offered once a check or download has finished. */
function UpdateActions() {
  const state = useStore(appUpdateStore);
  const confirmLeave = useRunReturnGuards();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        disabled={!state.canCheck()}
        aria-busy={state.status === UPDATE_TEXT.checking || undefined}
        onClick={() => void state.check()}
        data-testid="check-for-updates"
      >
        Check for updates
      </Button>
      {state.availableVersion === null ? null : (
        <Button
          variant="primary"
          disabled={!state.canDownload()}
          onClick={() => void state.download()}
          data-testid="download-update"
        >
          Download
        </Button>
      )}
      {state.readyToRestart ? (
        <Button
          variant="primary"
          disabled={!state.canRestart()}
          onClick={() => void state.restart(confirmLeave)}
          data-testid="restart-to-update"
        >
          Restart to update
        </Button>
      ) : null}
    </div>
  );
}

/**
 * App Settings' About card (§7.13): the build version and the manual update
 * controls. Restarting to update first resolves unsaved drafts on the page.
 */
export function AboutCard({ installation }: AboutCardProps) {
  const status = useStore(appUpdateStore, (state) => state.status);
  useEffect(() => {
    if (installation.readyVersion !== null) {
      appUpdateStore.getState().showReady();
    }
  }, [installation.readyVersion]);

  return (
    <SectionCard title="About" testId="about-card">
      <p data-testid="about-version" className="text-sm text-fg">
        Task Tracker version {installation.version}
      </p>
      <UpdateActions />
      <p
        role="status"
        data-testid="update-status"
        className="text-[13px] text-fg-muted empty:hidden"
      >
        {status}
      </p>
    </SectionCard>
  );
}
