import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, expect, test, vi } from "vitest";

type ProtocolHandler = (request: Request) => Promise<Response>;

const electron = vi.hoisted(() => ({
  handlers: new Map<string, ProtocolHandler>(),
  fetched: [] as string[],
}));

vi.mock("electron", () => ({
  app: { isPackaged: true },
  net: {
    fetch: (url: string) => {
      electron.fetched.push(url);
      return Promise.resolve(
        new Response("bundled", { headers: { "Content-Type": "text/html; charset=utf-8" } }),
      );
    },
  },
  protocol: {
    handle: (scheme: string, handler: ProtocolHandler) => {
      electron.handlers.set(scheme, handler);
    },
  },
}));

const { servePackagedRenderer } = await import("../src/renderer.js");

const resources = resolve("packaged-resources");
const web = join(resources, "web");

beforeEach(() => {
  electron.handlers.clear();
  electron.fetched.length = 0;
  Object.defineProperty(process, "resourcesPath", { value: resources, configurable: true });
});

interface RequestOptions {
  readonly method?: string;
  readonly rpcPort?: number | undefined;
}

/** Registers the packaged handler and sends it one request. */
function request(url: string, options: RequestOptions = {}) {
  const rpcPort = "rpcPort" in options ? options.rpcPort : 4321;
  servePackagedRenderer(() => rpcPort);
  const handler = electron.handlers.get("tasktracker");
  if (handler === undefined) {
    throw new Error("The renderer scheme was not handled.");
  }
  return handler(new Request(url, { method: options.method ?? "GET" }));
}

function fileUrl(...segments: string[]) {
  return pathToFileURL(join(web, ...segments)).href;
}

test("Serves the bundled index page", async () => {
  const response = await request("tasktracker://app/index.html");

  expect(response.status).toBe(200);
  expect(await response.text()).toBe("bundled");
  expect(electron.fetched).toEqual([fileUrl("index.html")]);
});

test("Serves bundled assets", async () => {
  const response = await request("tasktracker://app/assets/index-abc123.js");

  expect(response.status).toBe(200);
  expect(electron.fetched).toEqual([fileUrl("assets", "index-abc123.js")]);
});

test("Ignores the query and fragment when resolving the file", async () => {
  const response = await request("tasktracker://app/index.html?project=7&tab=items#details");

  expect(response.status).toBe(200);
  expect(electron.fetched).toEqual([fileUrl("index.html")]);
});

test.for([
  ["a dot-segment escape", "tasktracker://app/assets/../../secret.txt"],
  ["an encoded dot-segment escape", "tasktracker://app/assets/%2e%2e/%2e%2e/secret.txt"],
  ["an encoded slash escape", "tasktracker://app/assets/..%2f..%2fsecret.txt"],
  ["a root file outside assets", "tasktracker://app/package.json"],
  ["the web root itself", "tasktracker://app/"],
  ["another host", "tasktracker://other/index.html"],
])("Rejects %s", async ([, url]) => {
  const response = await request(url);

  expect(response.status).toBe(404);
  expect(electron.fetched).toEqual([]);
});

test("Rejects requests other than GET", async () => {
  const response = await request("tasktracker://app/index.html", { method: "POST" });

  expect(response.status).toBe(404);
  expect(electron.fetched).toEqual([]);
});

test("Answers a malformed percent escape with not found", async () => {
  const response = await request("tasktracker://app/assets/%E0%A4%A.js");

  expect(response.status).toBe(404);
  expect(electron.fetched).toEqual([]);
});

test("Limits the content security policy to bundled files and the current RPC port", async () => {
  const response = await request("tasktracker://app/index.html");

  expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  expect(response.headers.get("Content-Security-Policy")?.split("; ")).toEqual([
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src http://127.0.0.1:4321",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ]);
});

test("Blocks all connections while no RPC server is listening", async () => {
  const response = await request("tasktracker://app/index.html", { rpcPort: undefined });

  expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'none'");
});
