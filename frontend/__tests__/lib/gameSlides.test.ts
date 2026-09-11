import { describe, it, expect } from "vitest";
import {
  COUNTDOWN_WINDOW_MS,
  POST_WINDOW_MS,
  carouselTurnCount,
  gameForTurn,
  describeGame,
  formatAgo,
  formatCountdown,
  formatStartTime,
  gameClock,
  hexColor,
  isGameVisible,
  readableTextOn,
  virtualNow,
  visibleGames,
} from "@/lib/gameSlides";
import type { GameSlide, GamesResponse } from "@/lib/types";

const NOW = Date.parse("2026-09-10T02:00:00Z");

function game(overrides: Partial<GameSlide> = {}): GameSlide {
  return {
    id: "401",
    league: "NHL",
    sport_emoji: "🏒",
    team_key: "avalanche",
    team_abbr: "COL",
    team_name: "Colorado Avalanche",
    opponent_abbr: "VGK",
    opponent_name: "Golden Knights",
    color: "6F263D",
    alt_color: "236192",
    state: "pre",
    start: new Date(NOW + 3 * 60 * 60 * 1000).toISOString(),
    end: null,
    detail: "",
    team_score: null,
    opponent_score: null,
    result: null,
    venue: "Ball Arena",
    simulated: false,
    ...overrides,
  };
}

// ── The virtual clock ───────────────────────────────────────────────────────

describe("virtualNow", () => {
  const response = {
    generated_at: new Date(NOW).toISOString(),
    clock_rate: 1,
  } as GamesResponse;

  it("tracks real time one-for-one at rate 1", () => {
    const clock = gameClock(response, 5_000);

    expect(virtualNow(clock, 5_000)).toBe(NOW);
    expect(virtualNow(clock, 65_000)).toBe(NOW + 60_000);
  });

  it("ignores a skewed client clock by anchoring to the server's stamp", () => {
    // Client believes it is four minutes later than it is.
    const clock = gameClock(response, 1_000_000);

    expect(virtualNow(clock, 1_000_000)).toBe(NOW);
  });

  it("runs fast when the simulator raises the rate", () => {
    const clock = gameClock({ ...response, clock_rate: 60 }, 0);

    // One real second is one virtual minute.
    expect(virtualNow(clock, 1_000)).toBe(NOW + 60_000);
  });

  it("treats a missing or zero rate as real time", () => {
    const clock = gameClock({ ...response, clock_rate: 0 }, 0);

    expect(virtualNow(clock, 1_000)).toBe(NOW + 1_000);
  });
});

// ── Visibility ──────────────────────────────────────────────────────────────

describe("isGameVisible", () => {
  it("keeps upcoming and in-progress games regardless of age", () => {
    expect(isGameVisible(game({ state: "pre" }), NOW)).toBe(true);
    expect(isGameVisible(game({ state: "in" }), NOW)).toBe(true);
  });

  it("keeps a finished game inside the two-hour window", () => {
    const justOver = game({
      state: "post",
      end: new Date(NOW - POST_WINDOW_MS + 60_000).toISOString(),
    });

    expect(isGameVisible(justOver, NOW)).toBe(true);
  });

  it("drops a finished game once it is two hours old", () => {
    const stale = game({
      state: "post",
      end: new Date(NOW - POST_WINDOW_MS - 1000).toISOString(),
    });

    expect(isGameVisible(stale, NOW)).toBe(false);
  });

  it("falls back to the start time when no end was recorded", () => {
    const stale = game({
      state: "post",
      end: null,
      start: new Date(NOW - POST_WINDOW_MS - 1000).toISOString(),
    });

    expect(isGameVisible(stale, NOW)).toBe(false);
  });

  it("filters a list", () => {
    const kept = game({ id: "keep" });
    const dropped = game({
      id: "drop",
      state: "post",
      end: new Date(NOW - POST_WINDOW_MS - 1).toISOString(),
    });

    expect(visibleGames([kept, dropped], NOW).map((g) => g.id)).toEqual(["keep"]);
  });
});

// ── Carousel order ──────────────────────────────────────────────────────────

describe("carousel turn order", () => {
  const GAMES = ["avs", "rox", "nugs"];

  it("keeps the original two turns when nothing is on in Denver", () => {
    expect(carouselTurnCount(0)).toBe(2);
    expect(gameForTurn(0, [])).toBeUndefined(); // vehicle count
    expect(gameForTurn(1, [])).toBeUndefined(); // "Updated …"
  });

  it("opens on the vehicle count and closes on feed freshness", () => {
    expect(carouselTurnCount(GAMES.length)).toBe(5);
    expect(gameForTurn(0, GAMES)).toBeUndefined();
    expect(gameForTurn(4, GAMES)).toBeUndefined();
  });

  it("gives every game a turn in between, in order", () => {
    expect(gameForTurn(1, GAMES)).toBe("avs");
    expect(gameForTurn(2, GAMES)).toBe("rox");
    expect(gameForTurn(3, GAMES)).toBe("nugs");
  });

  it("covers each turn exactly once over a full rotation", () => {
    const turns = Array.from({ length: carouselTurnCount(GAMES.length) }, (_, i) =>
      gameForTurn(i, GAMES),
    );

    expect(turns.filter(Boolean)).toEqual(GAMES);
    expect(turns.filter((t) => t === undefined)).toHaveLength(2);
  });
});

// ── Phrasing ────────────────────────────────────────────────────────────────

describe("formatCountdown", () => {
  it("rounds to whole minutes", () => {
    expect(formatCountdown(45 * 60_000)).toBe("in 45 min");
    expect(formatCountdown(44 * 60_000 + 40_000)).toBe("in 45 min");
  });

  it("has a floor and a zero case", () => {
    expect(formatCountdown(20_000)).toBe("in <1 min");
    expect(formatCountdown(0)).toBe("any moment");
    expect(formatCountdown(-5000)).toBe("any moment");
  });
});

describe("formatAgo", () => {
  it("counts minutes, then hours", () => {
    expect(formatAgo(30_000)).toBe("just now");
    expect(formatAgo(20 * 60_000)).toBe("20 min ago");
    expect(formatAgo(60 * 60_000)).toBe("1h ago");
    expect(formatAgo(85 * 60_000)).toBe("1h 25m ago");
  });
});

describe("formatStartTime", () => {
  it("renders in Denver time with the zone named", () => {
    // 01:00Z on 10 Sep is 19:00 on 9 Sep in Denver (MDT).
    expect(formatStartTime("2026-09-10T01:00:00Z")).toBe("7:00 PM MT");
  });

  it("is empty for an unparseable stamp", () => {
    expect(formatStartTime("not a date")).toBe("");
  });
});

// ── Colour ──────────────────────────────────────────────────────────────────

describe("readableTextOn", () => {
  it("puts white on dark team colours", () => {
    expect(readableTextOn("#0E2240")).toBe("#ffffff"); // Nuggets navy
    expect(readableTextOn("#33006F")).toBe("#ffffff"); // Rockies purple
    expect(readableTextOn("#6F263D")).toBe("#ffffff"); // Avalanche burgundy
  });

  it("puts dark text on light ones", () => {
    expect(readableTextOn("#FEC524")).toBe("#111111"); // Nuggets gold
    expect(readableTextOn("#FFFFFF")).toBe("#111111");
  });
});

describe("hexColor", () => {
  it("normalises to a '#' form", () => {
    expect(hexColor("6F263D")).toBe("#6F263D");
    expect(hexColor("#6F263D")).toBe("#6F263D");
  });

  it("falls back on junk", () => {
    expect(hexColor("")).toBe("#6B7280");
    expect(hexColor("burgundy")).toBe("#6B7280");
  });
});

// ── The rendered slide ──────────────────────────────────────────────────────

describe("describeGame", () => {
  it("shows a clock time while the game is still hours away", () => {
    const view = describeGame(
      game({ start: new Date(NOW + 3 * 60 * 60 * 1000).toISOString() }),
      NOW,
    );

    expect(view.badge).toBe("COL");
    expect(view.lead).toBe("vs VGK");
    expect(view.status).toMatch(/MT$/);
    expect(view.score).toBeNull();
    expect(view.live).toBe(false);
  });

  it("switches to a countdown inside the last hour", () => {
    const view = describeGame(
      game({ start: new Date(NOW + 45 * 60_000).toISOString() }),
      NOW,
    );

    expect(view.status).toBe("in 45 min");
  });

  it("stays on the clock time just outside the countdown window", () => {
    const outside = describeGame(
      game({ start: new Date(NOW + COUNTDOWN_WINDOW_MS + 60_000).toISOString() }),
      NOW,
    );

    expect(outside.status).toMatch(/MT$/);
  });

  it("shows where play is at, with the score, while live", () => {
    const view = describeGame(
      game({ state: "in", detail: "Top 7th", team_score: 4, opponent_score: 2 }),
      NOW,
    );

    expect(view.live).toBe(true);
    expect(view.status).toBe("Top 7th");
    expect(view.score).toBe("4–2");
    expect(view.lead).toBe("vs VGK");
  });

  it("falls back when ESPN sends no phase string", () => {
    const view = describeGame(game({ state: "in", detail: "" }), NOW);

    expect(view.status).toBe("In progress");
  });

  it("shows the result and how long ago once it is over", () => {
    const view = describeGame(
      game({
        state: "post",
        result: "win",
        team_score: 4,
        opponent_score: 2,
        end: new Date(NOW - 20 * 60_000).toISOString(),
      }),
      NOW,
    );

    expect(view.lead).toBe("Won");
    expect(view.score).toBe("4–2");
    expect(view.status).toBe("20 min ago");
    expect(view.live).toBe(false);
  });

  it("names a loss and a draw", () => {
    const loss = describeGame(game({ state: "post", result: "loss", end: new Date(NOW).toISOString() }), NOW);
    const draw = describeGame(game({ state: "post", result: "draw", end: new Date(NOW).toISOString() }), NOW);

    expect(loss.lead).toBe("Lost");
    expect(draw.lead).toBe("Drew");
  });

  it("says Final when there is no recorded result", () => {
    const view = describeGame(
      game({ state: "post", result: null, end: new Date(NOW).toISOString() }),
      NOW,
    );

    expect(view.lead).toBe("Final");
  });

  it("pairs the badge colour with legible text", () => {
    const view = describeGame(game({ color: "FEC524" }), NOW);

    expect(view.color).toBe("#FEC524");
    expect(view.textColor).toBe("#111111");
  });

  it("carries a spoken label, since the visual form leans on colour", () => {
    const view = describeGame(
      game({ state: "in", detail: "Top 7th", team_score: 4, opponent_score: 2 }),
      NOW,
    );

    expect(view.label).toContain("Colorado Avalanche");
    expect(view.label).toContain("Top 7th");
  });
});
