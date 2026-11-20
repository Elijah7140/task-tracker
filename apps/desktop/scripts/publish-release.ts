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

/**
 * GitHub operations for a single tag. There is deliberately no way to delete a release:
 * a draft found on retry may have been published since it was read.
 */
export interface GitHubReleases {
  find(): Promise<GitHubRelease | undefined>;
  createDraft(prerelease: boolean): Promise<number>;
  /** Uploads the files, replacing any incomplete asset with the same name. */
  upload(assets: readonly ReleaseAsset[]): Promise<void>;
  publish(id: number, prerelease: boolean): Promise<void>;
}

type UploadedAsset = GitHubRelease["assets"][number];

const sameContent = (uploaded: UploadedAsset, { size, digest }: ReleaseAsset) =>
  uploaded.size === size && uploaded.digest === digest;

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

/**
 * Lists the files a leftover draft still needs. Completed uploads must match a verified file
 * by name and checksum, so a draft holding anything else is refused rather than replaced.
 */
function pendingUploads(
  draft: GitHubRelease,
  assets: readonly ReleaseAsset[],
  prerelease: boolean,
) {
  if (draft.prerelease !== prerelease) {
    throw new Error("The release draft has a different prerelease setting. Resolve it manually.");
  }
  const expected = new Map(assets.map((asset) => [basename(asset.path), asset]));
  const complete = new Set<string>();
  for (const uploaded of draft.assets) {
    const asset = expected.get(uploaded.name);
    if (asset === undefined) {
      throw new Error(
        `The release draft has unexpected asset '${uploaded.name}'. Resolve it manually.`,
      );
    }
    if (uploaded.state !== "uploaded") {
      continue;
    }
    if (!sameContent(uploaded, asset)) {
      throw new Error(
        `The release draft already has a different '${uploaded.name}'. Resolve it manually.`,
      );
    }
    complete.add(uploaded.name);
  }
  return assets.filter(({ path }) => !complete.has(basename(path)));
}

/** Creates or resumes the tag's draft and returns its ID with the files it still needs. */
async function prepareDraft(
  github: GitHubReleases,
  existing: GitHubRelease | undefined,
  assets: readonly ReleaseAsset[],
  prerelease: boolean,
) {
  if (existing === undefined) {
    return { id: await github.createDraft(prerelease), pending: assets };
  }
  return { id: existing.id, pending: pendingUploads(existing, assets, prerelease) };
}

/**
 * Publishes only after the tag's draft holds every verified asset. A retry resumes the
 * existing draft and never deletes a release, which may have been published meanwhile.
 */
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
  const { id, pending } = await prepareDraft(github, existing, assets, prerelease);
  if (pending.length > 0) {
    await github.upload(pending);
  }
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
    async createDraft(prerelease) {
      await gh(
        "release",
        "create",
        tag,
        "--repo",
        repository,
        "--verify-tag",
        "--draft",
        // GitHub writes the notes from merged pull requests; `--notes-from-tag` needs a
        // local checkout and is refused together with `--repo`.
        "--generate-notes",
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
      // Clobber replaces an asset left incomplete by an interrupted upload. Completed
      // assets were matched by checksum and are not uploaded again.
      await gh(
        "release",
        "upload",
        tag,
        "--repo",
        repository,
        "--clobber",
        ...assets.map(({ path }) => path),
      );
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
