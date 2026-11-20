import { createHashHistory } from "@tanstack/react-router";
import { TRAY_CARD_HASH } from "@task-tracker/contracts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRoot } from "./app/app-root.js";
import { ConnectionRequired } from "./app/connection-required.js";
import { rpcProtocolLayer } from "./rpc-client.js";
import { readRpcConnection } from "./rpc/rpc-connection-source.js";
import { TrayCardRoot } from "./tray-card/tray-card-root.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Task Tracker requires a root element.");
}

const connection = await readRpcConnection(window.taskTrackerDesktop);

/** Electron main opens the tray card as a second window of this page (§7.18). */
const isTrayCard = window.location.hash === TRAY_CARD_HASH;
if (isTrayCard) {
  document.documentElement.classList.add("tray-card");
}

const protocol = connection === undefined ? undefined : rpcProtocolLayer(connection);

function Screen() {
  if (protocol === undefined) {
    return <ConnectionRequired />;
  }
  return isTrayCard ? (
    <TrayCardRoot protocol={protocol} />
  ) : (
    <AppRoot protocol={protocol} history={createHashHistory()} />
  );
}

createRoot(root).render(
  <StrictMode>
    <Screen />
  </StrictMode>,
);
