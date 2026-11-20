import { Option, Schema } from "effect";

/** A file a release lists, named relative to its metadata, with its SHA-512 (base64) and size. */
const UpdateFileSchema = Schema.Struct({
  url: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)),
  sha512: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9+/]{86}==$/)),
  size: Schema.Int.check(Schema.isGreaterThan(0)),
});

const UpdateMetadataSchema = Schema.Struct({
  version: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  files: Schema.Array(UpdateFileSchema).check(Schema.isMinLength(1)),
});

/** A release file to download and verify. */
export type UpdateFile = typeof UpdateFileSchema.Type;

/** The parts of electron-builder update metadata the updater uses. */
export type UpdateMetadata = typeof UpdateMetadataSchema.Type;

const decodeMetadata = Schema.decodeUnknownOption(UpdateMetadataSchema);

type Fields = Record<string, string>;

const TOP_LEVEL = /^([A-Za-z][A-Za-z0-9]*):(?: (.*))?$/;
const LIST_ITEM = /^ {2}- ([A-Za-z][A-Za-z0-9]*): (.*)$/;
const ITEM_FIELD = /^ {4}([A-Za-z][A-Za-z0-9]*): (.*)$/;

/** Reads a plain or quoted YAML scalar, as electron-builder writes them. */
function scalar(raw: string): string {
  const text = raw.trim();
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replaceAll("''", "'");
  }
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1);
  }
  return text;
}

/** Adds one line to the parsed fields, or reports that it is outside the supported shape. */
function readLine(line: string, top: Fields, files: Fields[]): boolean {
  const item = LIST_ITEM.exec(line);
  if (item !== null) {
    files.push({ [item[1] ?? ""]: scalar(item[2] ?? "") });
    return true;
  }
  const field = ITEM_FIELD.exec(line);
  const current = files.at(-1);
  if (field !== null && current !== undefined) {
    current[field[1] ?? ""] = scalar(field[2] ?? "");
    return true;
  }
  const entry = TOP_LEVEL.exec(line);
  if (entry !== null) {
    top[entry[1] ?? ""] = scalar(entry[2] ?? "");
    return true;
  }
  return false;
}

function toCandidate(top: Fields, files: readonly Fields[]) {
  return {
    version: top.version,
    files: files.map((file) => ({ url: file.url, sha512: file.sha512, size: Number(file.size) })),
  };
}

/**
 * Parses the `latest*.yml` metadata electron-builder publishes with a release
 * (WP41): top-level scalars and the `files` list. Anything else, or a file named
 * outside the metadata's folder, makes the whole text invalid.
 */
export function parseUpdateMetadata(text: string): UpdateMetadata | undefined {
  const top: Fields = {};
  const files: Fields[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() !== "" && !line.startsWith("#") && !readLine(line, top, files)) {
      return undefined;
    }
  }
  return Option.getOrUndefined(decodeMetadata(toCandidate(top, files)));
}

/** The stable channel's metadata for this platform. Prerelease channels are never read. */
export function metadataFileName(platform: NodeJS.Platform): string | undefined {
  if (platform === "win32") {
    return "latest.yml";
  }
  return platform === "linux" ? "latest-linux.yml" : undefined;
}

const INSTALLER_EXTENSION: Partial<Record<NodeJS.Platform, string>> = {
  win32: ".exe",
  linux: ".AppImage",
};

/** The Windows installer or the Linux AppImage the release lists. */
export function installerFor(
  metadata: UpdateMetadata,
  platform: NodeJS.Platform,
): UpdateFile | undefined {
  const extension = INSTALLER_EXTENSION[platform];
  return extension === undefined
    ? undefined
    : metadata.files.find((file) => file.url.endsWith(extension));
}
