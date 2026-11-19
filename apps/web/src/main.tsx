import { createHashHistory } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRoot } from "./app/app-root.js";
import { ConnectionRequired } from "./app/connection-required.js";
import { rpcProtocolLayer } from "./rpc-client.js";
import { readRpcConnection } from "./rpc/rpc-connection-source.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Task Tracker requires a root element.");
}

const connection = await readRpcConnection(window.taskTrackerDesktop);

createRoot(root).render(
  <StrictMode>
    {connection === undefined ? (
      <ConnectionRequired />
    ) : (
      <AppRoot protocol={rpcProtocolLayer(connection)} history={createHashHistory()} />
    )}
  </StrictMode>,
);
