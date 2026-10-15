import { describe, expect, it } from "vitest";
import {
  activityLevel,
  dailyActivity,
  examMoment,
  forecast,
  heatmapWeeks,
  retentionByCourse,
  streaks,
  weeklyFocus,
} from "./stats";
import { recallAt, preview } from "./srs";

/** A local time on a day in October 2026, as the app stores it (ISO). */
const at = (day: number, hour = 10) => new Date(2026, 9, day, hour).toISOString();
const TODAY = "2026-10-15"; // a Thursday

describe("statistics", () => {
  it("adds up answers and focus time per local day", () => {
    const days = dailyActivity(
      [{ reviewedAt: at(14) }, { reviewedAt: at(14, 23) }, { reviewedAt: at(15, 0) }],
      [{ startedAt: at(14), minutes: 25 }],
    );
    expect(days.get("2026-10-14")).toEqual({ reviews: 2, minutes: 25 });
    expect(days.get("2026-10-15")).toEqual({ reviews: 1, minutes: 0 });
  });

  it("grades days for the heatmap", () => {
    expect(activityLevel(undefined)).toBe(0);
    expect(activityLevel({ reviews: 0, minutes: 0.2 })).toBe(0);
    expect(activityLevel({ reviews: 3, minutes: 0 })).toBe(1);
    expect(activityLevel({ reviews: 20, minutes: 10 })).toBe(2); // 15 "minutes"
    expect(activityLevel({ reviews: 0, minutes: 50 })).toBe(3);
    expect(activityLevel({ reviews: 100, minutes: 75 })).toBe(4);
  });

  it("counts streaks, keeping today's open until the day is over", () => {
    const days = dailyActivity(
      ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-12", "2026-10-13", "2026-10-14"].map((d) => ({
        reviewedAt: new Date(`${d}T12:00:00`).toISOString(),
      })),
      [],
    );
    expect(streaks(days, TODAY)).toEqual({ current: 3, longest: 4 });
    expect(streaks(days, "2026-10-16").current).toBe(0);
  });

  it("lays out the heatmap in weeks starting on Monday, ending with this week", () => {
    const weeks = heatmapWeeks(TODAY, 3);
    expect(weeks).toHaveLength(3);
    expect(weeks[2][0]).toBe("2026-10-12"); // Monday
    expect(weeks[2][3]).toBe(TODAY);
    expect(weeks[0][0]).toBe("2026-09-28");
    expect(weeks.flat()).toHaveLength(21);
  });

  it("forecasts learned cards per day, overdue ones today, new ones apart", () => {
    const { perDay, fresh } = forecast(
      [
        { state: 2, due: at(10) }, // overdue
        { state: 2, due: at(15, 18) },
        { state: 1, due: at(16) },
        { state: 2, due: at(28) }, // after the window
        { state: 0, due: at(1) },
      ],
      TODAY,
      7,
    );
    expect(perDay.map((d) => d.count)).toEqual([2, 1, 0, 0, 0, 0, 0]);
    expect(perDay[1].date).toBe("2026-10-16");
    expect(fresh).toBe(1);
  });

  it("measures retention on learned cards only, without cram answers", () => {
    const ret = retentionByCourse([
      { rating: 3, state: 2, cram: false, courseId: "ti" },
      { rating: 1, state: 2, cram: false, courseId: "ti" },
      { rating: 4, state: 2, cram: false, courseId: "ti" },
      { rating: 1, state: 0, cram: false, courseId: "ti" }, // new card
      { rating: 1, state: 2, cram: true, courseId: "ti" }, // cram
      { rating: 2, state: 2, cram: false, courseId: "dako" },
    ]);
    expect(ret.get("ti")).toEqual({ passed: 2, total: 3 });
    expect(ret.get("dako")).toEqual({ passed: 1, total: 1 });
  });

  it("sums focus per week", () => {
    const weeks = weeklyFocus(
      [
        { startedAt: at(12), minutes: 25 },
        { startedAt: at(15), minutes: 50 },
        { startedAt: at(6), minutes: 10 },
        { startedAt: at(1), minutes: 99 }, // before the window
      ],
      TODAY,
      2,
    );
    expect(weeks).toEqual([
      { week: "2026-10-05", minutes: 10 },
      { week: "2026-10-12", minutes: 75 },
    ]);
  });

  it("predicts recall on a later day from the card's memory state", () => {
    const now = new Date(2026, 9, 1, 10);
    const good = preview(null, 0, now)[2].result; // first answer: Good
    expect(recallAt(null, 0, now)).toBe(0);
    const soon = recallAt(good.srs, good.state, new Date(2026, 9, 2, 10));
    const later = recallAt(good.srs, good.state, new Date(2026, 10, 1, 10));
    expect(soon).toBeGreaterThan(later);
    expect(later).toBeGreaterThan(0);
    expect(examMoment("2026-10-28", "09:30").getHours()).toBe(9);
    expect(examMoment("2026-10-28", null).getHours()).toBe(9);
  });
});
