import { Schema } from "effect";

/** The workspace "Cards per row" setting: a whole number from 1 to 8 (§6.5, §7.17). */
export const CardColumns = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 }));
