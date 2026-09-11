// ── Home-game slide model ───────────────────────────────────────────────────
// The backend says what is *true* about a Denver home game — which phase it is
// in, the score, the period. This module decides what to *say* about it, and
// everything here is pure so the phrasing can be tested without a clock or a
// browser.
//
// The split matters because half of what a slide says has to keep moving
// between polls: "in 45 min" becomes "in 44 min" without the server being asked
// again. So the server sends instants (`start`, `end`) and the client does the
// subtraction on every tick.

import type { GameSlide, GamesResponse } from "@/lib/types";

/** A finished game keeps its slide this long, then clears. Mirrors
 *  SPORTS_POSTGAME_WINDOW_MINUTES on the backend. */
export const POST_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Inside this much of first pitch, the slide switches from a clock time to a
 *  countdown. Mirrors SPORTS_COUNTDOWN_MINUTES. */
export const COUNTDOWN_WINDOW_MS = 60 * 60 * 1000;

// ── The virtual clock ───────────────────────────────────────────────────────

/**
 * How the client tells the time.
 *
 * Anchored to the server's own `generated_at` rather than to the visitor's
 * system clock, which fixes clock skew for free — a laptop running four minutes
 * fast would otherwise show a game as already started.
 *
 * `rate` is virtual seconds per real second. It is 1 for live ESPN data and
 * higher while the simulator is running, which is the whole trick that lets a
 * three-hour game play out on screen in a couple of minutes: nothing downstream
 * of here knows or cares that time is moving faster than usual.
 */
export interface GameClock {
  /** Server time the payload was built (ms). */
  generatedAt: number;
  /** Client time the payload arrived (ms). */
  receivedAt: number;
  rate: number;
}

export function gameClock(response: GamesResponse, receivedAt: number): GameClock {
  return {
    generatedAt: Date.parse(response.generated_at),
    receivedAt,
    rate: response.clock_rate || 1,
  };
}

/** The instant the slides should be read against, in server time. */
export function virtualNow(clock: GameClock, realNow: number): number {
  return clock.generatedAt + (realNow - clock.receivedAt) * clock.rate;
}

// ── Visibility ──────────────────────────────────────────────────────────────

/**
 * Whether a slide still earns a turn in the carousel.
 *
 * The server filters this too, but the client's virtual clock keeps running
 * between polls — during a fast simulation a finished game passes its two-hour
 * mark long before the next fetch would notice.
 */
export function isGameVisible(game: GameSlide, now: number): boolean {
  if (game.state !== "post") return true;
  const end = game.end ? Date.parse(game.end) : Date.parse(game.start);
  return now - end <= POST_WINDOW_MS;
}

export function visibleGames(games: GameSlide[], now: number): GameSlide[] {
  return games.filter((g) => isGameVisible(g, now));
}

// ── Carousel order ──────────────────────────────────────────────────────────

/** Map turns the carousel always has: the vehicle count and the feed clock. */
export const MAP_TURNS = 2;

export function carouselTurnCount(gameCount: number): number {
  return MAP_TURNS + gameCount;
}

/**
 * Which game, if any, turn *index* of the carousel shows.
 *
 * Turn 0 is the vehicle count and the last turn is "Updated …"; home games take
 * the turns in between. Games are the thing worth noticing, so they lead rather
 * than trail, and feed freshness keeps the least-urgent last word. With no
 * games this collapses to the original two-turn cycle.
 */
export function gameForTurn<T>(index: number, games: T[]): T | undefined {
  return index > 0 ? games[index - 1] : undefined;
}

// ── Phrasing ────────────────────────────────────────────────────────────────

const DENVER_TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Denver",
});

/** "7:00 PM MT" — the site is Denver-local, but the zone is worth naming. */
export function formatStartTime(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  return `${DENVER_TIME.format(at)} MT`;
}

export function formatCountdown(msUntil: number): string {
  if (msUntil <= 0) return "any moment";
  const minutes = Math.round(msUntil / 60_000);
  if (minutes < 1) return "in <1 min";
  return `in ${minutes} min`;
}

export function formatAgo(msSince: number): string {
  if (msSince < 60_000) return "just now";
  const minutes = Math.floor(msSince / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h ago` : `${hours}h ${rest}m ago`;
}

const RESULT_WORDS: Record<string, string> = {
  win: "Won",
  loss: "Lost",
  draw: "Drew",
};

/** En-dash, not a hyphen — a scoreline is a range, not a subtraction. */
function scoreline(a: number | null, b: number | null): string | null {
  if (a === null || b === null) return null;
  return `${a}–${b}`;
}

// ── Colour ──────────────────────────────────────────────────────────────────

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a bare 6-digit hex. */
export function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return 0;
  const r = channel(parseInt(clean.slice(0, 2), 16));
  const g = channel(parseInt(clean.slice(2, 4), 16));
  const b = channel(parseInt(clean.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Black or white, whichever is legible on *hex*.
 *
 * Team colours span Broncos orange and Rockies near-black purple, and both have
 * to carry the abbreviation readably on a badge in either site theme. Picking
 * by measured contrast rather than by taste is what keeps that true for a club
 * whose colours we haven't seen yet — ESPN supplies them at runtime.
 */
export function readableTextOn(hex: string): string {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onBlack = (l + 0.05) / 0.05;
  return onBlack >= onWhite ? "#111111" : "#ffffff";
}

/** `#`-prefixed, and tolerant of the backend sending either form. */
export function hexColor(raw: string, fallback = "#6B7280"): string {
  const clean = raw?.replace("#", "").trim();
  return clean && /^[0-9a-fA-F]{6}$/.test(clean) ? `#${clean}` : fallback;
}

// ── The rendered slide ──────────────────────────────────────────────────────

export interface GameSlideView {
  id: string;
  /** Team abbreviation for the coloured badge — "COL", "DEN". */
  badge: string;
  emoji: string;
  color: string;
  /** Legible against `color`. */
  textColor: string;
  /** "vs VGK", or "Won"/"Lost"/"Drew" once it's over. */
  lead: string;
  /** "4–2" when there is a score to show. */
  score: string | null;
  /** "7:00 PM MT" · "in 45 min" · "Top 7th" · "20 min ago". */
  status: string;
  /** Drives the pulsing dot — only a game actually in progress gets one. */
  live: boolean;
  /** Spoken form, since the visual one leans on colour and abbreviation. */
  label: string;
}

/**
 * What one game slide says at *now*.
 *
 * The three phases come straight from the feature's own rules: a start time
 * until the game is close, a countdown inside the last hour, where play is at
 * while it's on, and the result with an age once it's over.
 */
export function describeGame(game: GameSlide, now: number): GameSlideView {
  const color = hexColor(game.color);
  const base = {
    id: game.id,
    badge: game.team_abbr,
    emoji: game.sport_emoji,
    color,
    textColor: readableTextOn(color),
  };

  if (game.state === "in") {
    const score = scoreline(game.team_score, game.opponent_score);
    const status = game.detail || "In progress";
    return {
      ...base,
      lead: `vs ${game.opponent_abbr}`,
      score,
      status,
      live: true,
      label: `${game.team_name} versus ${game.opponent_name}, ${
        score ? `${score}, ` : ""
      }${status}`,
    };
  }

  if (game.state === "post") {
    const end = game.end ? Date.parse(game.end) : Date.parse(game.start);
    const score = scoreline(game.team_score, game.opponent_score);
    const word = game.result ? RESULT_WORDS[game.result] : "Final";
    const status = formatAgo(Math.max(0, now - end));
    return {
      ...base,
      lead: word,
      score,
      status,
      live: false,
      label: `${game.team_name} ${word.toLowerCase()}${score ? ` ${score}` : ""} ${status}`,
    };
  }

  const start = Date.parse(game.start);
  const until = start - now;
  // Inside the last hour a countdown is what a rider actually wants; before
  // that, the clock time is the thing you can plan around.
  const status =
    until <= COUNTDOWN_WINDOW_MS ? formatCountdown(until) : formatStartTime(game.start);
  return {
    ...base,
    lead: `vs ${game.opponent_abbr}`,
    score: null,
    status,
    live: false,
    label: `${game.team_name} versus ${game.opponent_name}, ${status}`,
  };
}
