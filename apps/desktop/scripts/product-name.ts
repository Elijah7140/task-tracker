import { readFile, writeFile } from "node:fs/promises";
import { NtExecutable, NtExecutableResource, Resource } from "resedit";

/**
 * The product name of the unpacked copy that `test:desktop` drives. Electron
 * names the Start-menu shortcut it writes for notifications after the
 * executable's product name and points it at the running executable, so the
 * test copy must not share the installed app's “Task Tracker” name.
 */
export const TEST_BUILD_PRODUCT_NAME = "Task Tracker Test";

/**
 * Rewrites the product name and file description in every language of a
 * Windows executable's version resource, keeping every other resource.
 */
export async function setProductName(executable: string, productName: string) {
  const image = NtExecutable.from(await readFile(executable), { ignoreCert: true });
  const resources = NtExecutableResource.from(image);
  for (const version of Resource.VersionInfo.fromEntries(resources.entries)) {
    for (const language of version.getAllLanguagesForStringValues()) {
      version.setStringValues(language, { ProductName: productName, FileDescription: productName });
    }
    version.outputToResourceEntries(resources.entries);
  }
  resources.outputResource(image);
  await writeFile(executable, Buffer.from(image.generate()));
}

/** Reads the product names of a Windows executable's version resource. */
export async function readProductNames(executable: string) {
  const image = NtExecutable.from(await readFile(executable), { ignoreCert: true });
  const resources = NtExecutableResource.from(image);
  return Resource.VersionInfo.fromEntries(resources.entries).flatMap((version) =>
    version
      .getAllLanguagesForStringValues()
      .map((language) => version.getStringValues(language).ProductName),
  );
}
