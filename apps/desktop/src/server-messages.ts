import { DesktopToServerMessage, ServerToDesktopMessage } from "@task-tracker/contracts";
import { Option, Schema } from "effect";

/** Server lines longer than this are ignored rather than decoded. */
const MAX_LINE_LENGTH = 65_536;

const decodeMessage = Schema.decodeUnknownOption(Schema.fromJsonString(ServerToDesktopMessage));
const encodeCommand = Schema.encodeOption(Schema.fromJsonString(DesktopToServerMessage));

/** A validated message from the server child after its readiness line. */
export type ServerMessage = typeof ServerToDesktopMessage.Type;

/** A command for the server child. */
export type ServerCommand = typeof DesktopToServerMessage.Type;

/** Decodes one server line, or none for anything that is not a known message. */
export function decodeServerLine(line: string): Option.Option<ServerMessage> {
  return line.length > MAX_LINE_LENGTH ? Option.none() : decodeMessage(line);
}

/**
 * Encodes one command as a line for the server's stdin pipe, or none when it
 * breaks the protocol, such as a grant whose path is too long.
 */
export function encodeServerCommand(command: ServerCommand): Option.Option<string> {
  return Option.map(encodeCommand(command), (json) => `${json}\n`);
}
