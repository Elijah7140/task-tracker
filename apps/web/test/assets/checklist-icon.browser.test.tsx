import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import icoUrl from "../../../../assets/icon.ico?url";
import pngUrl from "../../../../assets/icon.png?url";
import svgText from "../../../../assets/icon.svg?raw";

/*
 * The tray icon, window, taskbar and installer share one checklist drawing (§7.18).
 * `node apps/desktop/scripts/icons.mjs` renders icon.png and icon.ico from icon.svg;
 * these checks keep the committed files showing that drawing, as the legacy
 * TrayIconArtTests and AppIconFileTests did.
 */

/** The sizes icons.mjs packs into icon.ico. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** How far a channel may drift from anti-aliasing before a pixel counts as different. */
const CHANNEL_TOLERANCE = 48;

function draw(source: CanvasImageSource, size: number) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d")!;
  context.drawImage(source, 0, 0, size, size);
  return context.getImageData(0, 0, size, size).data;
}

async function renderSvg(size: number) {
  const image = new Image(size, size);
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  await image.decode();
  return draw(image, size);
}

async function renderPng(png: Blob, size: number) {
  const bitmap = await createImageBitmap(png);
  expect(bitmap.width).toBe(size);
  return draw(bitmap, size);
}

function countDifferentPixels(left: Uint8ClampedArray, right: Uint8ClampedArray) {
  let different = 0;
  for (let index = 0; index < left.length; index += 4) {
    const channels = [0, 1, 2, 3].map((offset) =>
      Math.abs(left[index + offset]! - right[index + offset]!),
    );
    if (Math.max(...channels) > CHANNEL_TOLERANCE) {
      different++;
    }
  }
  return different;
}

/** Reads each PNG entry of an .ico file, keyed by pixel size (a stored 0 means 256). */
function readIcoEntries(file: ArrayBuffer) {
  const view = new DataView(file);
  const count = view.getUint16(4, true);
  return Array.from({ length: count }, (_, index) => {
    const entry = 6 + 16 * index;
    const size = view.getUint8(entry) === 0 ? 256 : view.getUint8(entry);
    const length = view.getUint32(entry + 8, true);
    const offset = view.getUint32(entry + 12, true);
    return { size, png: new Blob([file.slice(offset, offset + length)], { type: "image/png" }) };
  });
}

async function expectArtAt(png: Blob, size: number) {
  const different = countDifferentPixels(await renderPng(png, size), await renderSvg(size));

  expect(different).toBeLessThanOrEqual((size * size) / 50);
}

describe("checklist icon", () => {
  it("icon.png shows the SVG checklist at 256 pixels", async () => {
    const png = await (await fetch(pngUrl)).blob();

    await expectArtAt(png, 256);
  });

  it("icon.ico holds the SVG checklist at every size Windows asks for", async () => {
    const entries = readIcoEntries(await (await fetch(icoUrl)).arrayBuffer());

    expect(entries.map(({ size }) => size)).toEqual(ICO_SIZES);
    for (const { size, png } of entries) {
      await expectArtAt(png, size);
    }
  });

  it("The tray icon at its 32-pixel size matches the baseline", async () => {
    const tile = document.createElement("img");
    tile.src = pngUrl;
    tile.width = 32;
    tile.height = 32;
    tile.dataset["testid"] = "tray-icon";
    document.body.append(tile);
    await tile.decode();

    await expect.element(page.getByTestId("tray-icon")).toMatchScreenshot("tray-icon");

    tile.remove();
  });
});
