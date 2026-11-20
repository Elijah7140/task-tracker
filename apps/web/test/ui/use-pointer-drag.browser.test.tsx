import type {} from "@vitest/browser-playwright";
import { useState } from "react";
import { expect, it, onTestFinished } from "vitest";
import { cdp, page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { usePointerDrag } from "../../src/ui/use-pointer-drag.js";

interface Point {
  readonly x: number;
  readonly y: number;
}

/** One draggable box that reports whether a drag is running and how many drops it saw. */
function DragBox() {
  const start = usePointerDrag();
  const [dragging, setDragging] = useState(false);
  const [drops, setDrops] = useState(0);
  return (
    <div
      data-testid="drag-box"
      data-dragging={dragging ? "true" : undefined}
      data-drops={drops}
      style={{ width: 200, height: 200 }}
      onPointerDown={(event) =>
        start(event, {
          move: () => setDragging(true),
          drop: () => setDrops((count) => count + 1),
          end: () => setDragging(false),
        })
      }
    />
  );
}

function pointIn(element: Element, fraction: number): Point {
  const rect = element.getBoundingClientRect();
  const frame = window.frameElement?.getBoundingClientRect();
  return {
    x: Math.round((frame?.left ?? 0) + rect.left + rect.width * fraction),
    y: Math.round((frame?.top ?? 0) + rect.top + rect.height * fraction),
  };
}

const mouse = (
  type: "mousePressed" | "mouseReleased" | "mouseMoved",
  at: Point,
  buttons: number,
  button: "left" | "right" | "none" = "none",
) => cdp().send("Input.dispatchMouseEvent", { ...at, type, buttons, button, clickCount: 1 });

async function beginDrag(box: Element) {
  const from = pointIn(box, 0.25);
  const to = pointIn(box, 0.75);
  await mouse("mouseMoved", from, 0);
  await mouse("mousePressed", from, 1, "left");
  onTestFinished(async () => {
    await mouse("mouseReleased", to, 0, "left");
  });
  await mouse("mouseMoved", to, 1);
  return to;
}

/**
 * Behaves like Chromium on Windows on every OS: pointer capture goes as soon as
 * a second button goes down, before any context menu. Windows raises that menu
 * only on release, so it is swallowed here before the drag sees it.
 */
function releaseCaptureOnSecondaryPress(box: HTMLElement) {
  const release = (event: PointerEvent) => {
    // A right press sets bit 2 of buttons, a middle press bit 4.
    const bit = event.button === 2 ? 2 : event.button === 1 ? 4 : 0;
    const pressed = (event.buttons & bit) !== 0;
    if (pressed && box.hasPointerCapture(event.pointerId)) {
      box.releasePointerCapture(event.pointerId);
    }
  };
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  box.addEventListener("pointermove", release);
  window.addEventListener("contextmenu", swallow, true);
  onTestFinished(() => {
    box.removeEventListener("pointermove", release);
    window.removeEventListener("contextmenu", swallow, true);
  });
}

it("Keeps a left drag when a right press releases capture before any context menu", async () => {
  await render(<DragBox />);
  const box = page.getByTestId("drag-box");
  releaseCaptureOnSecondaryPress(box.element() as HTMLElement);
  const at = await beginDrag(box.element());

  await mouse("mousePressed", at, 3, "right");
  await mouse("mouseReleased", at, 1, "right");

  await expect.element(box).toHaveAttribute("data-dragging", "true");
  await mouse("mouseReleased", at, 0, "left");
  await expect.element(box).toHaveAttribute("data-drops", "1");
});

it("Ends the drag when capture is lost with only the left button down", async () => {
  await render(<DragBox />);
  const box = page.getByTestId("drag-box");
  const element = box.element() as HTMLElement;
  const at = await beginDrag(element);
  await expect.element(box).toHaveAttribute("data-dragging", "true");

  element.dispatchEvent(
    new PointerEvent("lostpointercapture", { bubbles: true, pointerId: 1, buttons: 1 }),
  );
  await mouse("mouseReleased", at, 0, "left");

  await expect.element(box).not.toHaveAttribute("data-dragging");
  await expect.element(box).toHaveAttribute("data-drops", "0");
});
