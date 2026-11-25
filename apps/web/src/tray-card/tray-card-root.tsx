import { RegistryProvider, useAtomValue } from "@effect/atom-react";
import type { InProgressItem } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { type ReactNode, useMemo, useRef } from "react";
import { useDataChangeListener } from "../native/data-change-broadcast.js";
import { popOutTrayCard } from "../native/tray-card-window.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { inProgressItemsAtom } from "../rpc/in-progress-queries.js";
import { serverInfoAtom } from "../rpc/server-info-query.js";
import { rpcProtocolAtom, type RpcProtocolLayer } from "../rpc/task-tracker-client.js";
import { useAppliedTheme } from "../state/use-applied-theme.js";
import { useAppliedUrgencyColors } from "../state/use-applied-urgency-colors.js";
import { ItemSurfaceContext } from "../workspace/item-surface.js";
import {
  InProgressCards,
  KeepOnTopButton,
  PopOutButton,
  TrayCardEmpty,
  TrayCardFrame,
  type TrayCardFrameRefs,
  type TrayCardLayout,
} from "./tray-card.js";
import { TrayItemCard } from "./tray-item-card.js";
import { useHoldWhileTyping } from "./use-hold-while-typing.js";
import { useKeepOnTop } from "./use-keep-on-top.js";
import { useReloadWhenShown } from "./use-reload-when-shown.js";
import { useReportCardSize } from "./use-report-card-size.js";
import { useTrayCardSettings } from "./use-tray-card-settings.js";

export type { TrayCardLayout } from "./tray-card.js";

type Item = typeof InProgressItem.Type;

function LoadFailure({ message }: { readonly message: string }) {
  return (
    <p role="alert" data-testid="tray-card-load-failure" className="text-[13px] text-danger">
      {message}
    </p>
  );
}

/** Every in-progress item as a workspace card, in the stack's order (§7.18). */
function Stack({
  items,
  layout,
  showItems,
  autoHideCompleted,
}: {
  readonly items: ReadonlyArray<Item>;
  readonly layout: TrayCardLayout;
  readonly showItems: boolean;
  readonly autoHideCompleted: boolean;
}) {
  const info = useAtomValue(serverInfoAtom);
  if (items.length === 0) {
    return <TrayCardEmpty />;
  }
  if (AsyncResult.isFailure(info)) {
    return <LoadFailure message={describeRpcFailure(info.cause)} />;
  }
  if (!AsyncResult.isSuccess(info)) {
    return null;
  }
  return (
    <ItemSurfaceContext value="tray">
      <InProgressCards layout={layout}>
        {items.map((item) => (
          <li key={item.itemId} data-testid="tray-card-item" data-item-id={item.itemId}>
            <TrayItemCard
              item={item}
              timeZone={info.value.timeZone}
              showItems={showItems}
              autoHideCompleted={autoHideCompleted}
            />
          </li>
        ))}
      </InProgressCards>
    </ItemSurfaceContext>
  );
}

/** The stack inside its frame, with the count once it has loaded. */
function StackFrame({
  layout,
  action,
  refs,
}: {
  readonly layout: TrayCardLayout;
  readonly action: ReactNode;
  readonly refs?: TrayCardFrameRefs | undefined;
}) {
  const result = useAtomValue(inProgressItemsAtom);
  const settings = useTrayCardSettings();
  const count = AsyncResult.isSuccess(result) ? result.value.length : null;
  const content = AsyncResult.match(result, {
    onInitial: () => null,
    onFailure: ({ cause }) => <LoadFailure message={describeRpcFailure(cause)} />,
    onSuccess: ({ value }) => (
      <Stack
        items={value}
        layout={layout}
        showItems={settings.showItems}
        autoHideCompleted={settings.autoHideCompleted}
      />
    ),
  });
  return (
    <TrayCardFrame layout={layout} size={settings.size} count={count} action={action} refs={refs}>
      {content}
    </TrayCardFrame>
  );
}

/**
 * The tray card by the icon. It reports its size so main can fit the window, and holds
 * the card open while a field has unsaved typing.
 */
function CardScreen() {
  const frame = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => ({ frame, body, content }), []);
  useReportCardSize(refs);
  useHoldWhileTyping();
  return (
    <StackFrame
      layout="card"
      refs={refs}
      action={<PopOutButton onPopOut={() => void popOutTrayCard()} />}
    />
  );
}

/** The popped-out window, which stays open when it loses focus and can keep on top. */
function WindowScreen() {
  const keepOnTop = useKeepOnTop();
  return (
    <StackFrame
      layout="window"
      action={<KeepOnTopButton onTop={keepOnTop.onTop} onToggle={keepOnTop.toggle} />}
    />
  );
}

function TrayCardScreen({ layout }: { readonly layout: TrayCardLayout }) {
  useAppliedTheme();
  useAppliedUrgencyColors();
  useDataChangeListener();
  useReloadWhenShown();
  return layout === "card" ? <CardScreen /> : <WindowScreen />;
}

/**
 * The renderer of the tray card window and of its popped-out window (§7.18):
 * every in-progress item as a workspace card, read with the launch's RPC
 * transport, in the app's theme. Electron main hides the card on Escape or when
 * it loses focus; the popped-out window stays until it is closed.
 */
export function TrayCardRoot({
  protocol,
  layout = "card",
}: {
  readonly protocol: RpcProtocolLayer;
  readonly layout?: TrayCardLayout;
}) {
  return (
    <RegistryProvider initialValues={[[rpcProtocolAtom, protocol]]}>
      <TrayCardScreen layout={layout} />
    </RegistryProvider>
  );
}
