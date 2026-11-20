import { expect, it } from "vitest";
import { snapCalendarMinute } from "../../src/calendar/calendar-drop-target.js";

it.each([
  [0, 0, 0],
  [48, 0, 60],
  [486, 0, 615],
  [485.9, 0, 600],
  [503, 23, 600],
  [0, 24, 0],
  [1151, 0, 1425],
  [1300, 40, 1425],
  [1151, 10, 1425],
])(
  "Snaps a pointer at %d pixels with a %d pixel grab offset to minute %d",
  (pointer, offset, minute) => {
    expect(snapCalendarMinute(pointer, offset)).toBe(minute);
  },
);
