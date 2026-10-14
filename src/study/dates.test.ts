import { describe, expect, it } from "vitest";
import { addDays, countdown, daysBetween, formatDate, todayISO } from "./dates";

describe("dates", () => {
  it("uses local calendar dates", () => {
    expect(todayISO(new Date(2026, 9, 14, 23, 59))).toBe("2026-10-14");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days across months and daylight-saving changes", () => {
    expect(daysBetween("2026-10-14", "2027-02-12")).toBe(121);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2); // clocks change in between
    expect(daysBetween("2026-10-14", "2026-10-10")).toBe(-4);
  });

  it("says how far away a date is", () => {
    const today = "2026-10-14";
    expect(countdown("2026-10-14", today)).toBe("today");
    expect(countdown("2026-10-15", today)).toBe("tomorrow");
    expect(countdown("2026-10-13", today)).toBe("yesterday");
    expect(countdown("2026-10-26", today)).toBe("in 12 days");
    expect(countdown("2026-10-11", today)).toBe("3 days ago");
  });

  it("formats dates, with the year only when it differs", () => {
    expect(formatDate("2026-10-16", "2026-10-14", "en-GB")).toBe("Fri 16 Oct");
    expect(formatDate("2027-02-12", "2026-10-14", "de-DE")).toBe("Fr., 12. Feb. 2027");
  });
});

describe("week start", () => {
  it("goes back to Monday midnight, local time", async () => {
    const { weekStart, dayStart } = await import("./dates");
    const wed = new Date(2026, 9, 14, 21, 30); // Wednesday
    const mon = new Date(weekStart(wed));
    expect([mon.getDay(), mon.getDate(), mon.getHours()]).toEqual([1, 12, 0]);
    const sun = new Date(2026, 9, 18, 10, 0);
    expect(new Date(weekStart(sun)).getDate()).toBe(12);
    expect(new Date(dayStart(wed)).getHours()).toBe(0);
  });
});
