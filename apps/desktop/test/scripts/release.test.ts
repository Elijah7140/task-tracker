import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test } from "vitest";
import {
  releaseVersion,
  releaseFiles,
  stageReleaseFiles,
  verifyReleaseFiles,
} from "../../scripts/release-files.ts";
import {
  publishRelease,
  type GitHubRelease,
  type GitHubReleases,
} from "../../scripts/publish-release.ts";

const tag = "v0.2.0-rc.1";
const version = releaseVersion(tag);
const platforms = ["win-x64", "linux-x64", "mac-arm64"] as const;

const releaseTest = test.extend<{ directory: string }>({
  directory: async ({ onTestFinished }, use) => {
    const directory = await mkdtemp(join(tmpdir(), "task-tracker-release-"));
    onTestFinished(() => rm(directory, { recursive: true, force: true }));
    await use(directory);
  },
});

async function assemble(directory: string) {
  const output = join(directory, "package");
  await mkdir(output);
  for (const platform of platforms) {
    for (const name of releaseFiles(platform, version)) {
      await writeFile(join(output, name), name);
    }
    await stageReleaseFiles(output, join(directory, platform), platform, version);
  }
  return verifyReleaseFiles(directory, version);
}

function fakeGitHub() {
  const actions: string[] = [];
  let release: GitHubRelease | undefined;
  const faults = { failUpload: false, corruptUpload: false };
  const github: GitHubReleases = {
    find: async () => release && structuredClone(release),
    createDraft: async (prerelease) => {
      actions.push(`draft (prerelease=${prerelease})`);
      release = { id: 42, draft: true, prerelease, assets: [] };
      return release.id;
    },
    upload: async (assets) => {
      actions.push(`upload ${assets.length}`);
      if (!release) {
        throw new Error("Draft missing");
      }
      const uploads = faults.failUpload ? assets.slice(0, 1) : assets;
      const names = new Set(uploads.map(({ path }) => basename(path)));
      release.assets = [
        ...release.assets.filter(({ name }) => !names.has(name)),
        ...uploads.map(({ path, size, digest }) => ({
          name: basename(path),
          state: "uploaded",
          size,
          digest: faults.corruptUpload ? "sha256:wrong" : digest,
        })),
      ];
      if (faults.failUpload) {
        release.assets.push({
          name: basename(assets[1]!.path),
          state: "starter",
          size: 0,
          digest: "",
        });
        throw new Error("Upload interrupted");
      }
    },
    publish: async () => {
      actions.push("publish");
      if (release) {
        release.draft = false;
      }
    },
  };
  const setRelease = (next: GitHubRelease) => {
    release = next;
  };
  return { actions, github, faults, setRelease };
}

const uploaded = ({ path, size, digest }: { path: string; size: number; digest: string }) => ({
  name: basename(path),
  state: "uploaded",
  size,
  digest,
});

test("Validates the tag and keeps prerelease metadata out of the stable channel", () => {
  expect(releaseFiles("linux-x64", releaseVersion("v0.2.0"))).toContain("latest-linux.yml");
  expect(releaseFiles("linux-x64", version)).toContain("beta-linux.yml");
  for (const invalid of ["0.2.0", "v0.2", "v01.2.0", "v1.2.3-01", "v1.2.3+1", "v1.2.3/extra"]) {
    expect(() => releaseVersion(invalid)).toThrow();
  }
});

releaseTest("Rejects a release with a missing platform", async ({ directory }) => {
  await assemble(directory);
  await rm(join(directory, "mac-arm64"), { recursive: true });

  await expect(verifyReleaseFiles(directory, version)).rejects.toThrow("mac-arm64");
});

releaseTest("Rejects a changed installer before publishing", async ({ directory }) => {
  const assets = await assemble(directory);
  await writeFile(assets[0]!.path, "changed");

  await expect(verifyReleaseFiles(directory, version)).rejects.toThrow("checksum");
});

releaseTest(
  "Resumes an interrupted draft upload and leaves the published release alone on retry",
  async ({ directory }) => {
    const assets = await assemble(directory);
    const { actions, github, faults } = fakeGitHub();
    faults.failUpload = true;

    await expect(publishRelease(github, version, assets)).rejects.toThrow("Upload interrupted");
    expect((await github.find())?.draft).toBe(true);
    faults.failUpload = false;
    await publishRelease(github, version, assets);
    await publishRelease(github, version, assets);

    expect(actions).toEqual([
      "draft (prerelease=true)",
      `upload ${assets.length}`,
      `upload ${assets.length - 1}`,
      "publish",
    ]);
    const published = await github.find();
    expect(published?.draft).toBe(false);
    expect(published?.assets).toHaveLength(assets.length);
  },
);

releaseTest("Refuses a draft whose asset conflicts without deleting it", async ({ directory }) => {
  const assets = await assemble(directory);
  const { actions, github, setRelease } = fakeGitHub();
  const conflicting = { ...uploaded(assets[0]!), digest: "sha256:other" };
  setRelease({ id: 7, draft: true, prerelease: true, assets: [conflicting] });

  await expect(publishRelease(github, version, assets)).rejects.toThrow(
    `The release draft already has a different '${conflicting.name}'`,
  );

  expect(actions).toEqual([]);
  expect(await github.find()).toEqual({
    id: 7,
    draft: true,
    prerelease: true,
    assets: [conflicting],
  });
});

releaseTest(
  "Refuses a draft with an unexpected asset or prerelease setting",
  async ({ directory }) => {
    const assets = await assemble(directory);
    const { actions, github, setRelease } = fakeGitHub();
    const unexpected = { name: "notes.txt", state: "uploaded", size: 1, digest: "sha256:x" };

    setRelease({ id: 7, draft: true, prerelease: true, assets: [unexpected] });
    await expect(publishRelease(github, version, assets)).rejects.toThrow("notes.txt");
    setRelease({ id: 7, draft: true, prerelease: false, assets: [] });
    await expect(publishRelease(github, version, assets)).rejects.toThrow("prerelease");

    expect(actions).toEqual([]);
    expect((await github.find())?.draft).toBe(true);
  },
);

releaseTest(
  "Leaves a draft unpublished if GitHub reports a different checksum",
  async ({ directory }) => {
    const assets = await assemble(directory);
    const { actions, github, faults } = fakeGitHub();
    faults.corruptUpload = true;

    await expect(publishRelease(github, releaseVersion("v0.2.0"), assets)).rejects.toThrow(
      "checksum",
    );

    expect(actions).toEqual(["draft (prerelease=false)", `upload ${assets.length}`]);
    expect((await github.find())?.draft).toBe(true);
  },
);
