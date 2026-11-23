import { describe, expect, it } from "vitest";
import { type FrameEvent, mainFrameGuard } from "../src/frame-guard.js";

const pageUrl = "tasktracker://app/index.html";
const contents = {} as Electron.WebContents;

function eventFrom(
  frame: { readonly parent: object | null; readonly url: string } | null,
  sender = contents,
) {
  return { sender, senderFrame: frame } as FrameEvent;
}

const guard = mainFrameGuard(
  (sender) => sender === contents,
  (url) => url === pageUrl,
);

describe("mainFrameGuard", () => {
  it("Accepts the main frame of the known window at the expected page", () => {
    const event = eventFrom({ parent: null, url: pageUrl });

    const allowed = guard(event);

    expect(allowed).toBe(true);
  });

  it("Refuses another window's contents", () => {
    const event = eventFrom({ parent: null, url: pageUrl }, {} as Electron.WebContents);

    const allowed = guard(event);

    expect(allowed).toBe(false);
  });

  it("Refuses an embedded frame even at the expected page", () => {
    const event = eventFrom({ parent: {}, url: pageUrl });

    const allowed = guard(event);

    expect(allowed).toBe(false);
  });

  it("Refuses a main frame that navigated to another page", () => {
    const event = eventFrom({ parent: null, url: "https://example.com/" });

    const allowed = guard(event);

    expect(allowed).toBe(false);
  });

  it("Refuses a call whose frame is already gone", () => {
    const event = eventFrom(null);

    const allowed = guard(event);

    expect(allowed).toBe(false);
  });
});
