import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { ticksPerDay, ticksPerHour, type DurationTicks } from "../time/duration-ticks.js";
import type { EffectiveSettings } from "./effective-settings.js";
import { hasValidThresholds } from "./settings-resolver.js";

const invalidThresholds = "Red threshold must be nonnegative and no greater than yellow.";

function describeDuration(ticks: DurationTicks): string {
  if (ticks >= ticksPerDay && ticks % ticksPerDay === 0n) {
    return `${ticks / ticksPerDay} days`;
  }
  const hours = Number(ticks) / Number(ticksPerHour);
  return `${Number(hours.toFixed(2))} hours`;
}

function describeConflict(projectName: string, settings: EffectiveSettings): string {
  const { urgencyYellowThreshold: yellow, urgencyRedThreshold: red } = settings;
  if (yellow.source === "Project" && red.source === "Global") {
    return `Project '${projectName}' overrides the yellow threshold to ${describeDuration(yellow.value)}, so the red threshold can't exceed it.`;
  }
  if (red.source === "Project" && yellow.source === "Global") {
    return `Project '${projectName}' overrides the red threshold to ${describeDuration(red.value)}, so the yellow threshold can't be lower than it.`;
  }
  return `Project '${projectName}' would be left with invalid thresholds. ${invalidThresholds}`;
}

/** Validate resolved thresholds, explaining override conflicts when a global edit affects a project. */
export function validateThresholds(settings: EffectiveSettings, affectedProjectName?: string) {
  if (!hasValidThresholds(settings)) {
    const message =
      affectedProjectName === undefined
        ? invalidThresholds
        : describeConflict(affectedProjectName, settings);
    throw new MetadataRuleError(message);
  }
}
