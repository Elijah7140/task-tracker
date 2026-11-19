import { Schema } from "effect";
import { ProjectProjection } from "./project-projection.js";

/** A home entry with the server's active open and overdue item counts. */
export const ProjectSummary = Schema.Struct({
  project: ProjectProjection,
  openCount: Schema.Int,
  overdueCount: Schema.Int,
});
