import { RegistryProvider } from "@effect/atom-react";
import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import type { Clock } from "effect";
import { useState } from "react";
import { DialogHost } from "../dialogs/dialog-host.js";
import { rpcProtocolAtom, type RpcProtocolLayer } from "../rpc/task-tracker-client.js";
import { rendererClockAtom } from "../rpc/urgency-refresh.js";
import { useAppliedTheme } from "../state/use-applied-theme.js";
import { createAppRouter } from "./router.js";

/** Props for {@link AppRoot}. */
export interface AppRootProps {
  readonly protocol: RpcProtocolLayer;
  readonly history: RouterHistory;
  /** The clock renderer timers use. Omit it for Effect's live clock. */
  readonly clock?: Clock.Clock | undefined;
}

function ThemedRouter({ history }: { readonly history: RouterHistory }) {
  const [router] = useState(() => createAppRouter(history));
  useAppliedTheme();
  return <RouterProvider router={router} />;
}

/**
 * Composes the renderer: the atom registry with the launch's RPC transport
 * and timer clock, the routed shell and the shared dialog host.
 */
export function AppRoot({ protocol, history, clock }: AppRootProps) {
  return (
    <RegistryProvider
      initialValues={[
        [rpcProtocolAtom, protocol],
        [rendererClockAtom, clock],
      ]}
    >
      <ThemedRouter history={history} />
      <DialogHost />
    </RegistryProvider>
  );
}
