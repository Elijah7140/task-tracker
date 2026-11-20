import { RegistryProvider, useAtomValue } from "@effect/atom-react";
import type { CurrentItemCard } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { useRef } from "react";
import { useDataChangeListener } from "../native/data-change-broadcast.js";
import { openItemFromTrayCard } from "../native/open-item-from-tray-card.js";
import { currentItemAtom } from "../rpc/current-item-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { rpcProtocolAtom, type RpcProtocolLayer } from "../rpc/task-tracker-client.js";
import { useAppliedTheme } from "../state/use-applied-theme.js";
import { TrayCardEmpty, TrayCardFrame, TrayCardItem } from "./tray-card.js";
import { useReloadWhenShown } from "./use-reload-when-shown.js";
import { useReportCardHeight } from "./use-report-card-height.js";
import { useTrayCardCompletion } from "./use-tray-card-completion.js";

function LoadedItem({ card }: { readonly card: typeof CurrentItemCard.Type }) {
  const completion = useTrayCardCompletion(card);
  return (
    <TrayCardItem
      card={card}
      completion={completion}
      onOpen={() => void openItemFromTrayCard(card.itemId)}
    />
  );
}

function TrayCardContent() {
  const result = useAtomValue(currentItemAtom);
  return AsyncResult.match(result, {
    onInitial: () => null,
    onFailure: ({ cause }) => (
      <p role="alert" data-testid="tray-card-load-failure" className="text-[13px] text-danger">
        {describeRpcFailure(cause)}
      </p>
    ),
    onSuccess: ({ value }) =>
      value === null ? <TrayCardEmpty /> : <LoadedItem key={value.itemId} card={value} />,
  });
}

function TrayCardScreen() {
  const frame = useRef<HTMLElement>(null);
  useAppliedTheme();
  useDataChangeListener();
  useReloadWhenShown();
  useReportCardHeight(frame);
  return (
    <TrayCardFrame frameRef={frame}>
      <TrayCardContent />
    </TrayCardFrame>
  );
}

/**
 * The tray card window's renderer (§7.18): the current item, read with the
 * launch's RPC transport, in the app's theme. It reports its height so Electron
 * main can fit the window, which hides on Escape or when it loses focus.
 */
export function TrayCardRoot({ protocol }: { readonly protocol: RpcProtocolLayer }) {
  return (
    <RegistryProvider initialValues={[[rpcProtocolAtom, protocol]]}>
      <TrayCardScreen />
    </RegistryProvider>
  );
}
