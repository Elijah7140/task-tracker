import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readProductNames,
  setProductName,
  TEST_BUILD_PRODUCT_NAME,
} from "../../scripts/product-name.ts";

/** A small Windows executable with a version resource that every Windows installation has. */
const systemExecutable = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "where.exe");

describe.runIf(process.platform === "win32")("setProductName", () => {
  it("Renames the product in every language of the version resource", async ({
    onTestFinished,
  }) => {
    const folder = await mkdtemp(join(tmpdir(), "task-tracker-product-name-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    const executable = join(folder, "app.exe");
    await copyFile(systemExecutable, executable);

    await setProductName(executable, TEST_BUILD_PRODUCT_NAME);

    const names = await readProductNames(executable);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names)).toEqual(new Set([TEST_BUILD_PRODUCT_NAME]));
  });
});
