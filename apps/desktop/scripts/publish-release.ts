import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import {
  releaseChannel,
  releaseVersion,
  verifyReleaseFiles,
  type ReleaseAsset,
} from "./release-files.ts";

/** GitHub release state used in the draft and upload checks. */
export interface GitHubRelease {
  id: number;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; digest: string; size: number; state: string }[];
}

/** GitHub operations for a single tag. */
export interface GitHubReleases {
  find(): Promise<GitHubRelease | undefined>;
  deleteDraft(id: number): Promise<void>;
  createDraft(prerelease: boolean): Promise<number>;
  upload(assets: readonly ReleaseAsset[]): Promise<void>;
  publish(id: number, prerelease: boolean): Promise<void>;
}

function verifyUpload(
  release: GitHubRelease,
  assets: readonly ReleaseAsset[],
  verifyChecksum: boolean,
) {
  for (const { path, digest, size } of assets) {
    const name = basename(path);
    const uploaded = release.assets.find(
      (asset) => asset.name === name && asset.state === "uploaded",
    );
    if (!uploaded) {
      throw new Error(`GitHub release is missing uploaded asset '${name}'.`);
    }
    if (verifyChecksum && (uploaded.size !== size || uploaded.digest !== digest)) {
      throw new Error(`GitHub release checksum mismatch for '${name}'.`);
    }
  }
}

/** Publishes only after a fresh draft has received every verified asset. */
export async function publishRelease(
  github: GitHubReleases,
  version: string,
  assets: readonly ReleaseAsset[],
) {
  const prerelease = releaseChannel(version) === "beta";
  const existing = await github.find();
  if (existing?.draft === false) {
    if (existing.prerelease !== prerelease) {
      throw new Error("The published release has a different prerelease setting.");
    }
    verifyUpload(existing, assets, false);
    console.log(`Release v${version} is already published.`);
    return;
  }
  if (existing) {
    await github.deleteDraft(existing.id);
  }
  const id = await github.createDraft(prerelease);
  await github.upload(assets);
  const draft = await github.find();
  if (draft?.id !== id || !draft.draft || draft.prerelease !== prerelease) {
    throw new Error("The release draft or its prerelease setting changed during upload.");
  }
  verifyUpload(draft, assets, true);
  await github.publish(id, prerelease);
}

const exec = promisify(execFile);

async function gh(...args: string[]) {
  const { stdout } = await exec("gh", args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

type TagRelease = GitHubRelease & { tag_name: string };

function githubReleases(repository: string, tag: string): GitHubReleases {
  const endpoint = `repos/${repository}/releases`;
  return {
    async find() {
      // Listing with write credentials includes drafts. A lookup failure aborts publication.
      const pages = JSON.parse(
        await gh("api", "--paginate", "--slurp", `${endpoint}?per_page=100`),
      ) as TagRelease[][];
      return pages.flat().find(({ tag_name }) => tag_name === tag);
    },
    async deleteDraft(id) {
      await gh("api", "--method", "DELETE", `${endpoint}/${id}`);
    },
    async createDraft(prerelease) {
      await gh(
        "release",
        "create",
        tag,
        "--repo",
        repository,
        "--verify-tag",
        "--draft",
        "--notes-from-tag",
        "--title",
        `Task Tracker ${tag.slice(1)}`,
        ...(prerelease ? ["--prerelease"] : []),
      );
      const draft = await this.find();
      if (!draft?.draft || draft.prerelease !== prerelease) {
        throw new Error(`Could not find the draft for '${tag}'.`);
      }
      return draft.id;
    },
    async upload(assets) {
      await gh("release", "upload", tag, "--repo", repository, ...assets.map(({ path }) => path));
    },
    async publish(id, prerelease) {
      await gh(
        "api",
        "--method",
        "PATCH",
        `${endpoint}/${id}`,
        "-F",
        "draft=false",
        "-f",
        `make_latest=${prerelease ? "false" : "legacy"}`,
        "--silent",
      );
    },
  };
}

async function main() {
  const [tag, directory, flag, ...extra] = process.argv.slice(2);
  if (!tag || !directory || (flag !== undefined && flag !== "--publish") || extra.length > 0) {
    throw new Error(
      "Usage: node apps/desktop/scripts/publish-release.ts <vVERSION> <bundle-parent> [--publish]",
    );
  }
  const version = releaseVersion(tag);
  const assets = await verifyReleaseFiles(directory, version);
  if (flag === undefined) {
    console.log(
      `Verified ${tag} (${releaseChannel(version)}):\n${assets.map(({ path }) => basename(path)).join("\n")}`,
    );
    return;
  }
  const { GITHUB_REPOSITORY, GITHUB_REF_NAME, GITHUB_REF_TYPE } = process.env;
  if (!GITHUB_REPOSITORY || GITHUB_REF_TYPE !== "tag" || GITHUB_REF_NAME !== tag) {
    throw new Error("Publication requires a matching GitHub tag workflow.");
  }
  await publishRelease(githubReleases(GITHUB_REPOSITORY, tag), version, assets);
}

if (import.meta.main) {
  await main();
}
