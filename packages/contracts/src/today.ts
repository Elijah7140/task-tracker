import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoDate } from "./iso-date-time.js";

/**
 * Why a row is on the Today page: completed today, or an ancestor shown as
 * context that is still open or was completed on an earlier day (§7.14).
 */
export const TodayRowState = Schema.Literals(["completedToday", "completedEarlier", "open"]);

const todayRowFields = {
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  title: Schema.String,
  state: TodayRowState,
  /** Descendants completed today, which a collapsed row shows. */
  completedDescendants: Schema.Int,
  /** Whether the item has a due date or scheduled block, for Push back one day. */
  hasDates: Schema.Boolean,
  statusId: Schema.NullOr(Guid),
  statusName: Schema.NullOr(Schema.String),
  priorityLevelId: Schema.NullOr(Guid),
};

/** One row of a Today area tree with its listed children in workspace order. */
export interface TodayRow extends Schema.Struct.Type<typeof todayRowFields> {
  readonly children: ReadonlyArray<TodayRow>;
}

/** One row of a Today area tree with its listed children in workspace order. */
export const TodayRow = Schema.Struct({
  ...todayRowFields,
  children: Schema.Array(Schema.suspend((): Schema.Codec<TodayRow> => TodayRow)),
});

/** An area with its breadcrumb, such as "Billing DB › dbo", and the roots of its tree. */
export const TodayArea = Schema.Struct({
  folderId: Schema.NullOr(Guid),
  path: Schema.String,
  rows: Schema.Array(TodayRow),
});

/** One project on the Today page. */
export const TodayProject = Schema.Struct({
  projectId: Guid,
  name: Schema.String,
  areas: Schema.Array(TodayArea),
});

/** Items completed during the server's local `day` that are still complete, with context. */
export const TodaySnapshot = Schema.Struct({
  day: IsoDate,
  completedCount: Schema.Int,
  projects: Schema.Array(TodayProject),
});
