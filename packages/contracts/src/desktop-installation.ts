import { Schema } from "effect";

/** An application version as the About line shows it, such as `0.2.0` or `0.3.0-beta.1`. */
export const AppVersionText = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64),
  Schema.isPattern(/^[0-9A-Za-z.+-]+$/),
);

/**
 * What a manual check for updates found (§7.13). An uninstalled build makes no
 * request. An unavailable feed, such as a private or missing release repository,
 * is told apart from other failures.
 */
export const UpdateCheckResult = Schema.Union([
  Schema.Struct({ outcome: Schema.Literal("up-to-date") }),
  Schema.Struct({ outcome: Schema.Literal("available"), version: AppVersionText }),
  Schema.Struct({ outcome: Schema.Literal("feed-unavailable") }),
  Schema.Struct({ outcome: Schema.Literal("failed") }),
  Schema.Struct({ outcome: Schema.Literal("not-installed") }),
]);

/**
 * What Electron main reports for App Settings (§7.13): the build version, whether
 * this installed build can update itself and offer start with system, and the
 * version of a downloaded and verified update awaiting a restart, if any.
 */
export const DesktopInstallation = Schema.Struct({
  version: AppVersionText,
  canUpdate: Schema.Boolean,
  startWithSystemAvailable: Schema.Boolean,
  readyVersion: Schema.NullOr(AppVersionText),
});
