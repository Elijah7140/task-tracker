import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const targets = {
  "win-x64": { extensions: ["exe", "exe.blockmap"], updateSuffix: "" },
  "linux-x64": { extensions: ["AppImage"], updateSuffix: "-linux" },
  "mac-arm64": { extensions: ["dmg", "dmg.blockmap", "zip", "zip.blockmap"], updateSuffix: "-mac" },
};
type Target = keyof typeof targets;

const checksumFile = "SHA256SUMS.json";

/** Validates a tag whose version can be used verbatim in package metadata and asset names. */
export function releaseVersion(tag: string): string {
  const identifier = "(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)";
  const semver = new RegExp(
    `^v(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-${identifier}(?:\\.${identifier})*)?$`,
  );
  if (!semver.test(tag) || /\s/.test(tag)) {
    throw new Error(`Expected a release tag like v0.2.0 or v0.2.0-rc.1. Got '${tag}'.`);
  }
  return tag.slice(1);
}

/** Keep prerelease metadata separate from the stable feed. */
export function releaseChannel(version: string): "latest" | "beta" {
  return version.includes("-") ? "beta" : "latest";
}

/** The native build for this workstation. Packaging requires the target OS and CPU. */
export function nativeReleaseTarget(): Target {
  const target = `${process.platform.replace("win32", "win").replace("darwin", "mac")}-${process.arch}`;
  if (target === "win-x64" || target === "linux-x64" || target === "mac-arm64") {
    return target;
  }
  throw new Error(`Unsupported desktop packaging target '${target}'.`);
}

/** Electron-builder's filename pattern for this native target. */
export function artifactName(target: Target) {
  return `task-tracker-\${version}-${target}.\${ext}`;
}

/** Exact set of assets to publish from a platform. */
export function releaseFiles(target: Target, version: string): string[] {
  const { extensions, updateSuffix } = targets[target];
  return [
    ...extensions.map((extension) =>
      artifactName(target).replace("${version}", version).replace("${ext}", extension),
    ),
    `${releaseChannel(version)}${updateSuffix}.yml`,
  ];
}

/** A local release asset and the metadata used to verify its uploaded copy. */
export interface ReleaseAsset {
  readonly path: string;
  readonly size: number;
  readonly digest: string;
}

async function inspectAsset(path: string): Promise<ReleaseAsset> {
  const status = await lstat(path);
  if (!status.isFile() || status.size === 0) {
    throw new Error(`Expected a nonempty release file at '${path}'.`);
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return { path, size: status.size, digest: `sha256:${hash.digest("hex")}` };
}

function assetChecksums(assets: readonly ReleaseAsset[]) {
  return JSON.stringify(
    Object.fromEntries(assets.map(({ path, digest }) => [basename(path), digest])),
    null,
    2,
  );
}

/** Copies only the listed assets into the CI bundle and records their checksums at the native build. */
export async function stageReleaseFiles(
  output: string,
  directory: string,
  target: Target,
  version: string,
) {
  await mkdir(directory);
  const assets = await Promise.all(
    releaseFiles(target, version).map(async (name) => {
      const asset = await inspectAsset(join(output, name));
      await cp(asset.path, join(directory, name));
      return asset;
    }),
  );
  await writeFile(join(directory, checksumFile), assetChecksums(assets));
}

async function verifyPlatform(directory: string, target: Target, version: string) {
  const assets = await Promise.all(
    releaseFiles(target, version).map((name) => inspectAsset(join(directory, name))),
  );
  const checksums = await readFile(join(directory, checksumFile), "utf8");
  if (checksums !== assetChecksums(assets)) {
    throw new Error(`Release checksum mismatch in '${directory}'.`);
  }
  return assets;
}

/** Validates all three CI bundles before a release can be created or modified. */
export async function verifyReleaseFiles(
  directory: string,
  version: string,
): Promise<ReleaseAsset[]> {
  const assets = await Promise.all([
    verifyPlatform(join(directory, "win-x64"), "win-x64", version),
    verifyPlatform(join(directory, "linux-x64"), "linux-x64", version),
    verifyPlatform(join(directory, "mac-arm64"), "mac-arm64", version),
  ]);
  return assets.flat();
}
