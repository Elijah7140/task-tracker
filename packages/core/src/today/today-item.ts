/**
 * An item completed during the local day, or one of its ancestors shown as
 * context, with where it lives (§7.14). `areaPath` is the project name followed
 * by the folder breadcrumb, such as "Billing DB › dbo".
 */
export interface TodayItem {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectOrder: number;
  readonly folderId: string | null;
  readonly areaPath: string;
  readonly parentItemId: string | null;
  readonly title: string;
  readonly sortOrder: number;
  readonly isCompleted: boolean;
  readonly completedToday: boolean;
  /** Whether the item has a due date, for Push back one day. */
  readonly hasDates: boolean;
  readonly statusId: string | null;
  readonly statusName: string | null;
  readonly priorityLevelId: string | null;
}
