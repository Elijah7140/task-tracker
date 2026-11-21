import { RegistryProvider, useAtomValue } from "@effect/atom-react";
import type { InProgressItem } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { type ReactNode, type RefObject, useRef } from "react";
import { useDataChangeListener } from "../native/data-change-broadcast.js";
import { openItemFromTrayCard } from "../native/open-item-from-tray-card.js";
import { popOutTrayCard } from "../native/tray-card-window.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { inProgressItemsAtom } from "../rpc/in-progress-queries.js";
import { rpcProtocolAtom, type RpcProtocolLayer } from "../rpc/task-tracker-client.js";
import { useAppliedTheme } from "../state/use-applied-theme.js";
import {
  InProgressList,
  InProgressRow,
  KeepOnTopButton,
  PopOutButton,
  TrayCardEmpty,
  TrayCardFrame,
} from "./tray-card.js";
import { useKeepOnTop } from "./use-keep-on-top.js";
import { useReloadWhenShown } from "./use-reload-when-shown.js";
import { useReportCardHeight } from "./use-report-card-height.js";
import { useTrayCardCompletion } from "./use-tray-card-completion.js";

type Item = typeof InProgressItem.Type;

/** Where the stack is drawn: the tray card by the icon, or its popped-out window. */
export type TrayCardLayout = "card" | "window";

function Row({ item, showStatus }: { readonly item: Item; readonly showStatus: boolean }) {
  const completion = useTrayCardCompletion(item);
  return (
    <InProgressRow
      item={item}
      showStatus={showStatus}
      completion={completion}
      onOpen={() => void openItemFromTrayCard(item.itemId)}
    />
  );
}

/** True when the stack holds items of more than one status, so rows name theirs. */
function mixesStatuses(items: ReadonlyArray<Item>): boolean {
  return new Set(items.map((item) => item.statusName)).size > 1;
}

function Stack({
  items,
  layout,
}: {
  readonly items: ReadonlyArray<Item>;
  readonly layout: TrayCardLayout;
}) {
  if (items.length === 0) {
    return <TrayCardEmpty />;
  }
  const showStatus = mixesStatuses(items);
  return (
    <InProgressList scroll={layout}>
      {items.map((item) => (
        <Row key={item.itemId} item={item} showStatus={showStatus} />
      ))}
    </InProgressList>
  );
}

/** The stack inside its frame, with the count once it has loaded. */
function StackFrame({
  layout,
  action,
  frameRef,
}: {
  readonly layout: TrayCardLayout;
  readonly action: ReactNode;
  readonly frameRef?: RefObject<HTMLElement | null> | undefined;
}) {
  const result = useAtomValue(inProgressItemsAtom);
  const count = AsyncResult.isSuccess(result) ? result.value.length : null;
  const content = AsyncResult.match(result, {
    onInitial: () => null,
    onFailure: ({ cause }) => (
      <p role="alert" data-testid="tray-card-load-failure" className="text-[13px] text-danger">
        {describeRpcFailure(cause)}
      </p>
    ),
    onSuccess: ({ value }) => <Stack items={value} layout={layout} />,
  });
  return (
    <TrayCardFrame layout={layout} count={count} action={action} frameRef={frameRef}>
      {content}
    </TrayCardFrame>
  );
}

/** The tray card by the icon. It reports its height so main can fit the window. */
function CardScreen() {
  const frame = useRef<HTMLElement>(null);
  useReportCardHeight(frame);
  return (
    <StackFrame
      layout="card"
      frameRef={frame}
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
  useDataChangeListener();
  useReloadWhenShown();
  return layout === "card" ? <CardScreen /> : <WindowScreen />;
}

/**
 * The renderer of the tray card window and of its popped-out window (§7.18):
 * the in-progress stack, read with the launch's RPC transport, in the app's
 * theme. Electron main hides the card on Escape or when it loses focus; the
 * popped-out window stays until it is closed.
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
