"use client";

// Unlisted game simulator.
//
// Nothing links here and the page does nothing on its own — the password is
// checked by the backend, and the simulation it starts lives in the backend
// too. That is the whole point: what you start here shows up on the live map
// for every device pointed at this deployment, so the carousel can be checked
// on a phone rather than only in the tab that started it.
//
// The preview below reads the *public* /sports/games endpoint through the same
// hook the map uses, so what it shows is what the map shows, by construction.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, createSimSession, startSim, stopSim, fetchSimStatus } from "@/lib/api";
import { useGames, useSportsTeams } from "@/lib/hooks";
import { Card, SectionHeading } from "@/components/ui/Card";
import GameSlideView from "@/components/map/GameSlideView";
import { describeGame, gameClock, virtualNow, visibleGames } from "@/lib/gameSlides";
import type { SimGameRequest, SimStatusResponse } from "@/lib/types";

const TOKEN_KEY = "transitden-sim-token";

const INPUT =
  "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent";
const LABEL = "mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-subtle";
const BUTTON =
  "rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

function emptyGame(teamKey = "avalanche"): SimGameRequest {
  return {
    team_key: teamKey,
    opponent_abbr: "VGK",
    opponent_name: "Golden Knights",
    lead_minutes: 45,
    game_minutes: 150,
    final_team_score: 4,
    final_opponent_score: 2,
  };
}

interface Scenario {
  name: string;
  hint: string;
  speed: number;
  duration: number;
  games: SimGameRequest[];
}

// Each of these is sized so the thing it demonstrates happens inside a minute
// or two of real time — the point of the simulator is not having to wait.
const SCENARIOS: Scenario[] = [
  {
    name: "Full arc",
    hint: "Countdown → live → final → clears. ~5 real minutes at 60×.",
    speed: 60,
    duration: 20,
    games: [emptyGame()],
  },
  {
    name: "Tips off now",
    hint: "Straight into a live game. Good for checking the score and period.",
    speed: 30,
    duration: 20,
    games: [{ ...emptyGame("nuggets"), opponent_abbr: "LAL", opponent_name: "Lakers", lead_minutes: 0, game_minutes: 145 }],
  },
  {
    name: "Three-game day",
    hint: "Rockies, Avs and Rapids at once — the carousel gives each a turn.",
    speed: 60,
    duration: 30,
    games: [
      { ...emptyGame("rockies"), opponent_abbr: "SD", opponent_name: "Padres", lead_minutes: 0, game_minutes: 180, final_team_score: 7, final_opponent_score: 5 },
      { ...emptyGame("avalanche"), lead_minutes: 40, game_minutes: 150 },
      { ...emptyGame("rapids"), opponent_abbr: "LAFC", opponent_name: "LAFC", lead_minutes: 90, game_minutes: 115, final_team_score: 1, final_opponent_score: 1 },
    ],
  },
];

export default function SimPage() {
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  // Restore a session from a reload. The token is validated against the server
  // rather than trusted, so a stale one drops you back to the password form.
  useEffect(() => {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setChecking(false);
      return;
    }
    fetchSimStatus(stored)
      .then(() => setToken(stored))
      .catch((err) => {
        sessionStorage.removeItem(TOKEN_KEY);
        if (err instanceof ApiError && err.status === 404) setUnavailable(true);
      })
      .finally(() => setChecking(false));
  }, []);

  const handleAuthed = useCallback((next: string) => {
    sessionStorage.setItem(TOKEN_KEY, next);
    setToken(next);
  }, []);

  const handleSignOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  if (checking) {
    return <Shell><p className="text-sm text-fg-subtle">Checking session…</p></Shell>;
  }

  if (unavailable) {
    return (
      <Shell>
        <Card>
          <SectionHeading
            title="Simulator not enabled"
            subtitle="This deployment has no SPORTS_SIM_PASSWORD set, so the simulator is switched off entirely."
          />
          <p className="text-sm text-fg-muted">
            Set <code className="rounded bg-raised px-1 py-0.5 text-xs">SPORTS_SIM_PASSWORD</code> in
            the backend environment and restart it.
          </p>
        </Card>
      </Shell>
    );
  }

  if (!token) {
    return (
      <Shell>
        <PasswordGate onAuthed={handleAuthed} onUnavailable={() => setUnavailable(true)} />
      </Shell>
    );
  }

  return (
    <Shell>
      <SimConsole token={token} onSignOut={handleSignOut} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-24">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-fg">Game simulator</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          Drives the map&apos;s home-game carousel with a scripted game, on the server, for
          everyone. Always expires by itself and hands back to ESPN.
        </p>
      </header>
      {children}
    </div>
  );
}

// ── Password ────────────────────────────────────────────────────────────────

function PasswordGate({
  onAuthed,
  onUnavailable,
}: {
  onAuthed: (token: string) => void;
  onUnavailable: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await createSimSession(password);
      onAuthed(session.token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        onUnavailable();
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Wait a minute and try again.");
      } else {
        setError("Incorrect password.");
      }
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <SectionHeading title="Password" subtitle="Set as SPORTS_SIM_PASSWORD in the backend .env" />
      <form onSubmit={submit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          placeholder="••••••••"
          className={INPUT}
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className={`${BUTTON} mt-4 w-full bg-accent text-accent-ink hover:opacity-90`}
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </Card>
  );
}

// ── Console ─────────────────────────────────────────────────────────────────

function SimConsole({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const teams = useSportsTeams();
  const [status, setStatus] = useState<SimStatusResponse | null>(null);
  const [games, setGames] = useState<SimGameRequest[]>([emptyGame()]);
  const [speed, setSpeed] = useState(60);
  const [duration, setDuration] = useState(20);
  const [hideReal, setHideReal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchSimStatus(token));
    } catch {
      // A dropped status poll is not worth surfacing; the next one will tell us.
    }
  }, [token]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  async function run(action: () => Promise<SimStatusResponse>) {
    setBusy(true);
    setError(null);
    try {
      setStatus(await action());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSignOut();
      } else {
        setError(err instanceof Error ? err.message : "Request failed");
      }
    } finally {
      setBusy(false);
    }
  }

  const applyScenario = (s: Scenario) => {
    setGames(s.games.map((g) => ({ ...g })));
    setSpeed(s.speed);
    setDuration(s.duration);
  };

  const updateGame = (index: number, patch: Partial<SimGameRequest>) =>
    setGames((list) => list.map((g, i) => (i === index ? { ...g, ...patch } : g)));

  const teamList = teams.data?.teams ?? [];

  return (
    <div className="space-y-5">
      <StatusPanel
        status={status}
        busy={busy}
        onStop={() => run(() => stopSim(token))}
        onSignOut={onSignOut}
      />

      <Preview />

      <Card>
        <SectionHeading
          title="Scenarios"
          subtitle="Presets sized so the thing they demonstrate happens within a minute or two"
        />
        <div className="grid gap-2 sm:grid-cols-3">
          {SCENARIOS.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => applyScenario(s)}
              className="rounded-lg border border-line bg-raised p-3 text-left transition-colors hover:border-line-strong"
            >
              <p className="text-sm font-semibold text-fg">{s.name}</p>
              <p className="mt-1 text-xs text-fg-subtle">{s.hint}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeading
          title="Games"
          subtitle="Durations are in virtual minutes — at 60× a 150-minute game is over in about two and a half real minutes"
        />
        <div className="space-y-4">
          {games.map((game, i) => (
            <div key={i} className="rounded-lg border border-line bg-raised p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Game {i + 1}
                </p>
                {games.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setGames((list) => list.filter((_, j) => j !== i))}
                    className="text-xs font-semibold text-danger hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL}>Team</label>
                  <select
                    value={game.team_key}
                    onChange={(e) => updateGame(i, { team_key: e.target.value })}
                    className={INPUT}
                  >
                    {teamList.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.emoji} {t.name} ({t.league})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Opponent</label>
                  <div className="flex gap-2">
                    <input
                      value={game.opponent_abbr}
                      onChange={(e) => updateGame(i, { opponent_abbr: e.target.value })}
                      maxLength={6}
                      placeholder="VGK"
                      className={`${INPUT} w-24`}
                    />
                    <input
                      value={game.opponent_name}
                      onChange={(e) => updateGame(i, { opponent_name: e.target.value })}
                      maxLength={40}
                      placeholder="Golden Knights"
                      className={INPUT}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <NumberField
                  label="Pre-game (min)"
                  value={game.lead_minutes}
                  min={0}
                  onChange={(v) => updateGame(i, { lead_minutes: v })}
                />
                <NumberField
                  label="Game length (min)"
                  value={game.game_minutes}
                  min={1}
                  onChange={(v) => updateGame(i, { game_minutes: v })}
                />
                <NumberField
                  label="Final — us"
                  value={game.final_team_score}
                  min={0}
                  onChange={(v) => updateGame(i, { final_team_score: v })}
                />
                <NumberField
                  label="Final — them"
                  value={game.final_opponent_score}
                  min={0}
                  onChange={(v) => updateGame(i, { final_opponent_score: v })}
                />
              </div>
            </div>
          ))}
        </div>

        {games.length < 6 && (
          <button
            type="button"
            onClick={() => setGames((list) => [...list, emptyGame("nuggets")])}
            className="mt-3 text-sm font-semibold text-accent hover:underline"
          >
            + Add another game
          </button>
        )}
      </Card>

      <Card>
        <SectionHeading title="Run" subtitle="The simulation always expires on its own" />
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="Clock speed (× real time)"
            value={speed}
            min={1}
            max={600}
            onChange={setSpeed}
          />
          <NumberField
            label="Expires after (real minutes)"
            value={duration}
            min={1}
            max={240}
            onChange={setDuration}
          />
        </div>

        {/* Real games sit on the wall clock, a sped-up simulation on its own
            faster one. The two only coincide at 1×, so above that the choice
            isn't available rather than quietly wrong. */}
        <label
          className={`mt-3 flex items-center gap-2 text-sm ${speed > 1 ? "text-fg-subtle" : "text-fg-muted"}`}
        >
          <input
            type="checkbox"
            checked={hideReal || speed > 1}
            disabled={speed > 1}
            onChange={(e) => setHideReal(e.target.checked)}
            className="h-4 w-4 accent-current"
          />
          Hide real ESPN games while this runs
        </label>
        {speed > 1 && (
          <p className="mt-1 text-xs text-fg-subtle">
            Always on above 1× — a faster clock would race a real game&apos;s countdown too.
          </p>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || games.length === 0}
            onClick={() =>
              run(() =>
                startSim(token, {
                  games,
                  speed,
                  duration_minutes: duration,
                  // Mirrors the disabled checkbox above; the API rejects the
                  // combination too, so this can't drift out of agreement.
                  hide_real: hideReal || speed > 1,
                }),
              )
            }
            className={`${BUTTON} bg-accent text-accent-ink hover:opacity-90`}
          >
            {status?.active ? "Restart simulation" : "Start simulation"}
          </button>
          {status?.active && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => stopSim(token))}
              className={`${BUTTON} border border-line text-fg-muted hover:border-line-strong`}
            >
              Stop now
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isNaN(next)) onChange(next);
        }}
        className={INPUT}
      />
    </div>
  );
}

// ── Status ──────────────────────────────────────────────────────────────────

function StatusPanel({
  status,
  busy,
  onStop,
  onSignOut,
}: {
  status: SimStatusResponse | null;
  busy: boolean;
  onStop: () => void;
  onSignOut: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const active = status?.active === true;
  const expiresIn = useMemo(() => {
    if (!status?.expires_at) return null;
    return Math.max(0, Date.parse(status.expires_at) - now);
  }, [status?.expires_at, now]);

  return (
    <Card className={active ? "border-accent/60" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${active ? "animate-pulse bg-ok motion-reduce:animate-none" : "bg-fg-subtle"}`}
            />
            <h2 className="text-base font-semibold text-fg">
              {active ? "Simulation running" : "Idle — showing live ESPN data"}
            </h2>
          </div>
          {active && status && (
            <p className="mt-1 text-xs text-fg-subtle">
              {status.speed}× clock · {status.elapsed_virtual_minutes} virtual minutes elapsed ·{" "}
              {status.hide_real ? "real games hidden" : "alongside real games"}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {active && expiresIn !== null && (
            <span className="rounded-full border border-line bg-raised px-3 py-1 text-xs font-semibold text-fg-muted">
              ends in {formatDuration(expiresIn)}
            </span>
          )}
          {active && (
            <button
              type="button"
              disabled={busy}
              onClick={onStop}
              className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="text-xs font-semibold text-fg-subtle hover:text-fg-muted"
          >
            Sign out
          </button>
        </div>
      </div>
    </Card>
  );
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

// ── Preview ─────────────────────────────────────────────────────────────────

/**
 * What the map is showing right now, read from the public endpoint.
 *
 * Deliberately the same hook and the same pure helpers the carousel uses — a
 * preview that rendered from the *control* endpoint could agree with itself
 * while the real map disagreed.
 */
function Preview() {
  const { data, dataUpdatedAt } = useGames();
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const views = useMemo(() => {
    if (!data) return [];
    const clock = gameClock(data, dataUpdatedAt);
    const at = virtualNow(clock, tick);
    return visibleGames(data.games, at).map((g) => describeGame(g, at));
  }, [data, dataUpdatedAt, tick]);

  return (
    <Card>
      <SectionHeading
        title="On the map now"
        subtitle="Straight from /api/v1/sports/games — the same feed the carousel reads"
      />
      {views.length === 0 ? (
        <p className="text-sm text-fg-subtle">
          No game slides. The carousel is showing only its own map turns.
        </p>
      ) : (
        <ul className="space-y-2">
          {views.map((view) => (
            <li
              key={view.id}
              className="flex h-9 w-fit max-w-full items-center overflow-hidden rounded-full border bg-card px-3 text-sm"
              style={{ borderColor: `${view.color}99` }}
            >
              <GameSlideView view={view} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
