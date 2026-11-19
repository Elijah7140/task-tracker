import { RegistryProvider } from "@effect/atom-react";
import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { useState } from "react";
import { DialogHost } from "../dialogs/dialog-host.js";
import { rpcProtocolAtom, type RpcProtocolLayer } from "../rpc/task-tracker-client.js";
import { useAppliedTheme } from "../state/use-applied-theme.js";
import { createAppRouter } from "./router.js";

/** Props for {@link AppRoot}. */
export interface AppRootProps {
  readonly protocol: RpcProtocolLayer;
  readonly history: RouterHistory;
}

function ThemedRouter({ history }: { readonly history: RouterHistory }) {
  const [router] = useState(() => createAppRouter(history));
  useAppliedTheme();
  return <RouterProvider router={router} />;
}

/**
 * Composes the renderer: the atom registry with the launch's RPC transport,
 * the routed shell and the shared dialog host.
 */
export function AppRoot({ protocol, history }: AppRootProps) {
  return (
    <RegistryProvider initialValues={[[rpcProtocolAtom, protocol]]}>
      <ThemedRouter history={history} />
      <DialogHost />
    </RegistryProvider>
  );
}
