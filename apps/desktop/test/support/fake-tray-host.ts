import { type ChildProcess, execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect } from "vitest";

const WATCHER_NAME = "org.kde.StatusNotifierWatcher";
const BUS = "org.freedesktop.DBus";

/** Writes D-Bus wire values in little-endian order with their alignment. */
class WireWriter {
  readonly bytes: number[] = [];

  align(boundary: number) {
    while (this.bytes.length % boundary !== 0) {
      this.bytes.push(0);
    }
  }

  byte(value: number) {
    this.bytes.push(value);
  }

  uint32(value: number) {
    this.align(4);
    this.bytes.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff);
  }

  string(value: string) {
    const encoded = Buffer.from(value, "utf8");
    this.uint32(encoded.length);
    this.bytes.push(...encoded, 0);
  }

  signature(value: string) {
    this.byte(value.length);
    this.bytes.push(...Buffer.from(value, "ascii"), 0);
  }
}

type HeaderField = readonly [code: number, type: "o" | "s" | "g", value: string];

/** Encodes a method call to the bus daemon with an optional `su` body. */
function methodCall(serial: number, member: string, body?: readonly [string, number]) {
  const payload = new WireWriter();
  if (body !== undefined) {
    payload.string(body[0]);
    payload.uint32(body[1]);
  }
  const fields: HeaderField[] = [
    [1, "o", "/org/freedesktop/DBus"],
    [2, "s", BUS],
    [3, "s", member],
    [6, "s", BUS],
    ...(body === undefined ? [] : [[8, "g", "su"] as const]),
  ];
  const header = new WireWriter();
  header.bytes.push("l".charCodeAt(0), 1, 0, 1);
  header.uint32(payload.bytes.length);
  header.uint32(serial);
  header.uint32(0);
  const lengthOffset = header.bytes.length - 4;
  const start = header.bytes.length;
  for (const [code, type, value] of fields) {
    header.align(8);
    header.byte(code);
    header.signature(type);
    if (type === "g") {
      header.signature(value);
    } else {
      header.string(value);
    }
  }
  const fieldsLength = new WireWriter();
  fieldsLength.uint32(header.bytes.length - start);
  header.bytes.splice(lengthOffset, 4, ...fieldsLength.bytes);
  header.align(8);
  return Buffer.from([...header.bytes, ...payload.bytes]);
}

/** Authenticates as the current user and claims the watcher's well-known name. */
async function claimWatcherName(socketPath: string) {
  const socket = connect(socketPath);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve).once("error", reject);
  });
  const uid = String(process.getuid?.() ?? 0);
  socket.write(`\0AUTH EXTERNAL ${Buffer.from(uid).toString("hex")}\r\n`);
  await new Promise<void>((resolve) => socket.once("data", () => resolve()));
  socket.write("BEGIN\r\n");
  socket.write(methodCall(1, "Hello"));
  socket.write(methodCall(2, "RequestName", [WATCHER_NAME, 4]));
  socket.resume();
  return socket;
}

const execFileAsync = promisify(execFile);

async function watcherOwned(address: string) {
  const { stdout } = await execFileAsync(
    "dbus-send",
    [
      `--bus=${address}`,
      "--print-reply=literal",
      `--dest=${BUS}`,
      "/org/freedesktop/DBus",
      `${BUS}.NameHasOwner`,
      `string:${WATCHER_NAME}`,
    ],
    { timeout: 2_000 },
  );
  return stdout.includes("boolean true");
}

/** A private session bus, optionally with a stand-in tray host. */
export interface FakeSessionBus {
  /** The bus address to give the app as `DBUS_SESSION_BUS_ADDRESS`. */
  readonly address: string;
  readonly close: () => Promise<void>;
}

/**
 * Starts a private D-Bus session where a stand-in owns the StatusNotifierWatcher
 * name, so the packaged app on Linux finds a tray host under Xvfb. Without
 * `withTrayHost`, the bus has no watcher and the app must fall back to minimising.
 */
export async function startFakeSessionBus(withTrayHost: boolean): Promise<FakeSessionBus> {
  const directory = await mkdtemp(join(tmpdir(), "task-tracker-bus-"));
  const socketPath = join(directory, "bus");
  const address = `unix:path=${socketPath}`;
  const daemon: ChildProcess = spawn(
    "dbus-daemon",
    ["--session", "--nofork", "--nopidfile", `--address=${address}`],
    { stdio: "ignore" },
  );
  let watcher: Socket | undefined;
  const close = async () => {
    watcher?.destroy();
    daemon.kill();
    await rm(directory, { recursive: true, force: true });
  };
  try {
    await expect
      .poll(() =>
        watcherOwned(address).then(
          () => true,
          () => false,
        ),
      )
      .toBe(true);
    if (withTrayHost) {
      watcher = await claimWatcherName(socketPath);
      await expect.poll(() => watcherOwned(address)).toBe(true);
    }
    return { address, close };
  } catch (error) {
    await close();
    throw error;
  }
}
