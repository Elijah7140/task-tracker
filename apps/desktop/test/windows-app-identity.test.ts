import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_IDENTITY,
  INSTALLED_IDENTITY,
  UNPACKED_IDENTITY,
  windowsAppIdentity,
} from "../src/windows-app-identity.js";

const CLSID = /^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/;

describe("windowsAppIdentity", () => {
  it("Gives the installed build the installer's application ID", () => {
    const identity = windowsAppIdentity({ isPackaged: true, installed: true });

    expect(identity).toBe(INSTALLED_IDENTITY);
    expect(identity.appUserModelId).toBe("app.tasktracker.desktop");
  });

  it("Keeps the unpacked test copy and development runs off the installed identity", () => {
    const unpacked = windowsAppIdentity({ isPackaged: true, installed: false });
    const development = windowsAppIdentity({ isPackaged: false, installed: false });

    expect(unpacked).toBe(UNPACKED_IDENTITY);
    expect(development).toBe(DEVELOPMENT_IDENTITY);
  });

  it("Uses a distinct application ID and brace-wrapped CLSID for each build", () => {
    const identities = [INSTALLED_IDENTITY, UNPACKED_IDENTITY, DEVELOPMENT_IDENTITY];

    const ids = new Set(identities.map((identity) => identity.appUserModelId));
    const clsids = new Set(identities.map((identity) => identity.toastActivatorClsid));

    expect(ids.size).toBe(3);
    expect(clsids.size).toBe(3);
    for (const clsid of clsids) {
      expect(clsid).toMatch(CLSID);
    }
  });
});
