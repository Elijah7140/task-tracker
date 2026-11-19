import type { SeedItem } from "./fake-area-items.js";
import type { SeedProject } from "./fake-task-tracker-server.js";

/** Root items covering every row column, sub-items, attribution and completed sections. */
export const BILLING_ITEMS: ReadonlyArray<SeedItem> = [
  {
    title: "Add index to Invoice.CustomerId",
    type: "Change",
    ticketNumber: "JIRA-1234",
    priority: "High",
    dueDate: "2026-11-20",
    urgency: "Approaching",
    displayed: { value: "Overdue", sourceTitle: "Check query plan before/after" },
    children: [
      { title: "Check query plan before/after", urgency: "Overdue", dueDate: "2026-11-12" },
      { title: "Draft migration script", completedAtUtc: "2026-11-12T16:00:00Z" },
      { title: "Agree on index name", completedAtUtc: "2026-11-13T09:30:00Z" },
    ],
  },
  {
    title: "Investigate nightly export failure",
    type: "Error",
    ticketNumber: "OPS-88",
    priority: "Critical",
    dueDate: "2026-11-14",
    dueTime: "17:00:00",
    urgency: "Imminent",
  },
  {
    title: "Schema review with the data team",
    type: "Discussion",
    priority: "Medium",
    scheduledStart: "2026-11-19T15:00:00",
  },
  {
    title: "Retire legacy billing views",
    type: "Change",
    completedAtUtc: "2026-11-13T08:00:00Z",
    children: [{ title: "List view consumers" }],
  },
  { title: "Tidy column comments", priority: "Low" },
  { title: "Archive 2024 invoices", type: "Change", completedAtUtc: "2026-11-11T10:00:00Z" },
  { title: "Rotate service credentials", type: "Error", completedAtUtc: "2026-11-13T14:00:00Z" },
];

/** A project with nested folders and populated areas. */
export const BILLING_PROJECT: SeedProject = {
  name: "Billing DB",
  openCount: 6,
  overdueCount: 1,
  items: BILLING_ITEMS,
  folders: [
    { name: "dbo", items: [{ title: "Review schema permissions", priority: "Medium" }] },
    { name: "Tables", parent: "dbo", items: BILLING_ITEMS },
    { name: "Views", parent: "dbo" },
    { name: "Stored procedures", parent: "dbo" },
    { name: "Reporting" },
  ],
};
