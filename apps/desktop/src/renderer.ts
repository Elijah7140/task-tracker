import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { DESKTOP_RENDERER_ORIGIN, RPC_HOST } from "@task-tracker/contracts";
import { app, net, protocol } from "electron";

const scheme = "tasktracker";

/** Gives bundled assets a fixed origin that loopback RPC can check. */
export function registerRendererScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ]);
}

/** The page the window loads and the origin the RPC server accepts. */
export interface RendererAddress {
  readonly url: string;
  readonly origin: string;
}

/** Resolves the local Vite server in development or the packaged renderer. */
export function rendererAddress(): RendererAddress {
  if (!app.isPackaged) {
    return developmentAddress(process.env.TASKTRACKER_DEV_RENDERER ?? "");
  }
  return { url: `${DESKTOP_RENDERER_ORIGIN}/index.html`, origin: DESKTOP_RENDERER_ORIGIN };
}

function developmentAddress(origin: string): RendererAddress {
  const url = URL.canParse(origin) ? new URL(origin) : undefined;
  if (url?.protocol !== "http:" || url.hostname !== RPC_HOST || url.href !== `${url.origin}/`) {
    throw new Error("Expected a loopback Vite origin. Launch development with pnpm dev.");
  }
  return { url: url.href, origin: url.origin };
}

/** Serves only bundled renderer files and limits network requests to the current RPC listener. */
export function servePackagedRenderer(rpcPort: () => number | undefined) {
  const root = resolve(process.resourcesPath, "web");
  protocol.handle(scheme, async (request) => {
    const file = bundledFile(root, request);
    if (file === undefined) {
      return new Response(null, { status: 404 });
    }
    const response = await net.fetch(pathToFileURL(file).href);
    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy", contentSecurityPolicy(rpcPort()));
    return new Response(response.body, { status: response.status, headers });
  });
}

/** Decodes a request path, or returns undefined for a malformed percent escape. */
function decodePath(pathname: string) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

/** Resolves a GET for `index.html` or `assets/…` inside the root, rejecting anything else. */
function bundledFile(root: string, request: Request) {
  const url = new URL(request.url);
  const pathname = decodePath(url.pathname);
  if (pathname === undefined) {
    return undefined;
  }
  const file = resolve(root, `.${pathname}`);
  const path = relative(root, file);
  const allowed = path === "index.html" || path.startsWith(`assets${sep}`);
  if (request.method !== "GET" || url.host !== "app" || isAbsolute(path) || !allowed) {
    return undefined;
  }
  return file;
}

function contentSecurityPolicy(rpcPort: number | undefined) {
  const connect = rpcPort === undefined ? "'none'" : `http://${RPC_HOST}:${rpcPort}`;
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    `connect-src ${connect}`,
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join("; ");
}
