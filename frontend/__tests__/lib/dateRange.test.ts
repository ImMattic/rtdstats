import { describe, it, expect } from "vitest";
import {
  DEFAULT_RANGE_LIMITS,
  RANGE_PRESETS,
  calendarDays,
  clampLocal,
  describeLimits,
  fromLocalInput,
  isDaySelectable,
  isPresetActive,
  isSameDay,
  presetRange,
  rangeBounds,
  toLocalInput,
} from "@/lib/dateRange";

// A fixed "now" so the bounds are deterministic. Local time throughout, matching
// what a datetime-local input carries.
const NOW = new Date(2026, 8, 9, 14, 30); // 9 Sep 2026, 14:30
const LIMITS = { maxSpanHours: 24, retentionDays: 365 };

describe("toLocalInput / fromLocalInput", () => {
  it("round-trips a local datetime through the input format", () => {
    const d = new Date(2026, 0, 5, 7, 4);
    expect(toLocalInput(d)).toBe("2026-01-05T07:04");
    expect(fromLocalInput("2026-01-05T07:04")?.getTime()).toBe(d.getTime());
  });

  it("returns null for values that are not datetime-local strings", () => {
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("2026-01-05")).toBeNull();
    expect(fromLocalInput("nonsense")).toBeNull();
  });

  it("ignores a seconds component some browsers append", () => {
    expect(fromLocalInput("2026-01-05T07:04:33")?.getMinutes()).toBe(4);
  });
});

describe("rangeBounds", () => {
  it("lets start reach back a full retention window but not into the future", () => {
    const { start } = rangeBounds("2026-09-09T13:30", LIMITS, NOW);
    expect(start.min).toBe(toLocalInput(new Date(2025, 8, 9, 14, 30)));
    // A minute before now, so there is always room for an end after it.
    expect(start.max).toBe("2026-09-09T14:29");
  });

  it("caps end at the max span when start is far enough back", () => {
    const { end } = rangeBounds("2026-09-01T08:00", LIMITS, NOW);
    expect(end.min).toBe("2026-09-01T08:01");
    expect(end.max).toBe("2026-09-02T08:00");
  });

  it("caps end at now when start plus the max span would run past it", () => {
    const { end } = rangeBounds("2026-09-09T10:00", LIMITS, NOW);
    expect(end.max).toBe("2026-09-09T14:30");
  });

  it("honours a non-default span cap", () => {
    const { end } = rangeBounds("2026-09-01T08:00", { maxSpanHours: 6, retentionDays: 90 }, NOW);
    expect(end.max).toBe("2026-09-01T14:00");
  });

  it("does not clamp start against the current end, so the window can move back", () => {
    // Start is a month before anything the *end* field would allow; it stays put.
    const { start } = rangeBounds("2026-08-01T00:00", LIMITS, NOW);
    expect(fromLocalInput("2026-08-01T00:00")! >= fromLocalInput(start.min)!).toBe(true);
  });

  it("still produces a usable end window when start is outside the data window", () => {
    const { end } = rangeBounds("2000-01-01T00:00", LIMITS, NOW);
    // Anchored to the earliest retained instant rather than yielding min > max.
    expect(fromLocalInput(end.min)!.getTime()).toBeLessThan(fromLocalInput(end.max)!.getTime());
  });

  it("produces a range the API's own rules accept", () => {
    const startLocal = "2026-09-08T22:15";
    const { end } = rangeBounds(startLocal, LIMITS, NOW);
    const s = fromLocalInput(startLocal)!;
    const e = fromLocalInput(end.max)!;
    expect(e.getTime()).toBeGreaterThan(s.getTime());
    expect(e.getTime() - s.getTime()).toBeLessThanOrEqual(LIMITS.maxSpanHours * 3_600_000);
    expect(e.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });
});

describe("clampLocal", () => {
  const bounds = { min: "2026-09-09T08:00", max: "2026-09-09T18:00" };

  it("leaves a value inside the window untouched", () => {
    expect(clampLocal("2026-09-09T12:00", bounds)).toBe("2026-09-09T12:00");
  });

  it("pulls a value below the window up to the minimum", () => {
    expect(clampLocal("2026-09-08T23:00", bounds)).toBe(bounds.min);
  });

  it("pulls a value above the window down to the maximum", () => {
    expect(clampLocal("2026-09-10T01:00", bounds)).toBe(bounds.max);
  });

  it("keeps the window's own edges, which are inclusive", () => {
    expect(clampLocal(bounds.min, bounds)).toBe(bounds.min);
    expect(clampLocal(bounds.max, bounds)).toBe(bounds.max);
  });

  it("falls back to the minimum for an unparseable value", () => {
    expect(clampLocal("", bounds)).toBe(bounds.min);
  });
});

describe("isDaySelectable", () => {
  const min = new Date(2026, 8, 9, 14, 30);
  const max = new Date(2026, 8, 10, 9, 0);

  it("accepts a day that only partly overlaps the window", () => {
    // 9 Sep is selectable from 14:30, 10 Sep only until 09:00 — both usable.
    expect(isDaySelectable(new Date(2026, 8, 9), min, max)).toBe(true);
    expect(isDaySelectable(new Date(2026, 8, 10), min, max)).toBe(true);
  });

  it("rejects the days either side of the window", () => {
    expect(isDaySelectable(new Date(2026, 8, 8), min, max)).toBe(false);
    expect(isDaySelectable(new Date(2026, 8, 11), min, max)).toBe(false);
  });

  it("treats a missing bound as unbounded on that side", () => {
    expect(isDaySelectable(new Date(1990, 0, 1), null, max)).toBe(true);
    expect(isDaySelectable(new Date(2090, 0, 1), min, null)).toBe(true);
  });
});

describe("calendarDays", () => {
  it("always returns six Sunday-aligned weeks", () => {
    const days = calendarDays(new Date(2026, 8, 1));
    expect(days).toHaveLength(42);
    expect(days[0].getDay()).toBe(0);
  });

  it("includes every day of the month it is given", () => {
    const days = calendarDays(new Date(2026, 1, 1)); // February 2026
    const inMonth = days.filter((d) => d.getMonth() === 1);
    expect(inMonth).toHaveLength(28);
  });

  it("pads with the neighbouring months' days", () => {
    const days = calendarDays(new Date(2026, 8, 1)); // 1 Sep 2026 is a Tuesday
    expect(isSameDay(days[0], new Date(2026, 7, 30))).toBe(true);
  });
});

describe("describeLimits", () => {
  it("says the default 72-hour cap as three days", () => {
    expect(describeLimits(DEFAULT_RANGE_LIMITS)).toBe(
      "Ranges span at most 3 days, within the last 365 days.",
    );
  });

  it("keeps hours when the cap is not a whole number of days", () => {
    expect(describeLimits({ maxSpanHours: 6, retentionDays: 30 })).toContain("6 hours");
  });
});

describe("presetRange", () => {
  it("anchors the window to now and reaches back exactly `hours`", () => {
    const { start, end } = presetRange(3, LIMITS, NOW);
    expect(end).toBe(toLocalInput(NOW));
    expect(start).toBe(toLocalInput(new Date(2026, 8, 9, 11, 30)));
  });

  it("caps the span at the server's own limit rather than the button's label", () => {
    const { start, end } = presetRange(72, { maxSpanHours: 24, retentionDays: 365 }, NOW);
    expect(fromLocalInput(end)!.getTime() - fromLocalInput(start)!.getTime()).toBe(
      24 * 3_600_000,
    );
  });

  it("caps the span at the retention window when that is the tighter limit", () => {
    const { start, end } = presetRange(72, { maxSpanHours: 72, retentionDays: 1 }, NOW);
    expect(fromLocalInput(end)!.getTime() - fromLocalInput(start)!.getTime()).toBe(
      24 * 3_600_000,
    );
  });

  it("covers every shipped preset without throwing", () => {
    for (const preset of RANGE_PRESETS) {
      const { start, end } = presetRange(preset.hours, LIMITS, NOW);
      expect(fromLocalInput(start)!.getTime()).toBeLessThan(fromLocalInput(end)!.getTime());
    }
  });
});

describe("isPresetActive", () => {
  it("matches the preset that produced the exact same range", () => {
    const { start, end } = presetRange(6, LIMITS, NOW);
    expect(isPresetActive(start, end, 6, LIMITS, NOW)).toBe(true);
  });

  it("rejects a range that only partly overlaps a preset", () => {
    const { start, end } = presetRange(6, LIMITS, NOW);
    expect(isPresetActive(start, end, 3, LIMITS, NOW)).toBe(false);
  });

  it("rejects a range with the right span but an end that isn't now", () => {
    // Six hours wide, same as the "Last 6 hours" preset, but ending an hour
    // and a half before `NOW` rather than right on it.
    expect(isPresetActive("2026-09-09T07:00", "2026-09-09T13:00", 6, LIMITS, NOW)).toBe(false);
  });
});
