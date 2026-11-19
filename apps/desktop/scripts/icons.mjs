// Regenerates assets/icon.png and assets/icon.ico from assets/icon.svg.
// Run after changing the SVG: node apps/desktop/scripts/icons.mjs
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const assets = new URL("../../../assets/", import.meta.url);
const icoSizes = [16, 24, 32, 48, 64, 128, 256];

/** Renders the SVG at one square size with a transparent background. */
async function renderPng(page, svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  return page.screenshot({ omitBackground: true });
}

/** Packs PNG images into one ICO file, which Windows reads from Vista onwards. */
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    // A stored dimension of 0 means 256 pixels.
    entry.writeUInt8(size % 256, 0);
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

const svg = await readFile(new URL("icon.svg", assets), "utf8");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const images = [];
  for (const size of icoSizes) {
    images.push({ size, png: await renderPng(page, svg, size) });
  }
  await writeFile(new URL("icon.png", assets), images.at(-1).png);
  await writeFile(new URL("icon.ico", assets), packIco(images));
} finally {
  await browser.close();
}
