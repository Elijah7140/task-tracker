import { Duration } from "effect";
import { TaskTrackerClient } from "./task-tracker-client.js";

/**
 * Facts the renderer formats with, such as the server's IANA time zone. They
 * do not change during a launch, so the result is kept for the session.
 */
export const serverInfoAtom = TaskTrackerClient.query("GetServerInfo", undefined, {
  timeToLive: Duration.infinity,
});
