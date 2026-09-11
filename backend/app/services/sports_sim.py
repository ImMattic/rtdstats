"""Server-side game simulator for the home-game carousel.

The point of this module is to let someone see the carousel do its whole job —
countdown, live period, final score, and then clearing itself — without waiting
for the Avalanche to actually play.  It is server-side on purpose: the map on
every device pointed at this deployment shows the simulated game, which is what
makes it usable for checking the feature on a phone.

Two ideas carry the design:

**A virtual timeline.**  ``speed`` is virtual seconds per real second, and the
simulation publishes *the whole payload* on its own timeline rather than on the
real one: ``generated_at`` is the virtual now, and every game's ``start`` and
``end`` are fixed instants on that same timeline.  The client is told the rate
and advances its own clock at it, so the subtraction ``start - virtual_now``
gives an honest countdown while ``start`` itself never moves.

Publishing offsets from the *real* now instead — which is what this did first —
gets the countdown right and the clock time wrong: re-deriving ``start`` from a
new "now" on every poll republishes a different absolute timestamp, so a game
shown as "7:05 PM" slides backwards toward the present as you watch it.  A
kickoff time is a fixed fact; only the distance to it changes.

**No ticking.**  State is a script plus a start instant; the current phase is a
pure function of how much virtual time has passed.  There is no background job,
nothing to drift, and a poll at any moment gets a consistent answer.

The simulation always expires.  ``expires_at`` is real wall-clock time and is
checked on every read, so a forgotten simulation hands the map back to ESPN by
itself rather than sticking a fake Nuggets game on the site forever.
"""
from __future__ import annotations

import logging
import math
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.config import get_settings
from app.schemas.sports import GameSlide
from app.services.sports import TEAMS_BY_KEY

logger = logging.getLogger(__name__)

_settings = get_settings()

# Guard rails.  These bound what the control endpoint will accept, so a typo in
# the simulator form can't pin a fake game to the site for a week.
MAX_GAMES = 6
MIN_SPEED = 1.0
MAX_SPEED = 600.0


@dataclass(frozen=True)
class SimGame:
    """One scripted game.  Durations are virtual minutes."""

    team_key: str
    opponent_abbr: str
    opponent_name: str
    lead_minutes: float
    game_minutes: float
    final_team_score: int
    final_opponent_score: int


@dataclass
class SimState:
    games: list[SimGame]
    started_at: datetime
    expires_at: datetime
    speed: float
    hide_real: bool = True
    # Stable per-run suffix so slide ids don't collide with real ESPN event ids.
    run_id: str = field(default_factory=lambda: secrets.token_hex(4))

    def elapsed_virtual_seconds(self, now: datetime) -> float:
        return max(0.0, (now - self.started_at).total_seconds() * self.speed)

    def virtual_now(self, now: datetime) -> datetime:
        """Where the simulation's own clock has reached.

        The timeline shares its origin with real time at ``started_at`` and then
        runs ``speed`` times faster.  At speed 1 the two coincide exactly, which
        is what lets real ESPN games be shown alongside a simulation.
        """
        return self.started_at + timedelta(seconds=self.elapsed_virtual_seconds(now))


# ── Module state ───────────────────────────────────────────────────────────

_state: SimState | None = None
# token -> expiry.  Sessions are in-process; a backend restart logs you out,
# which is the right trade for a tool that should never be widely open.
_sessions: dict[str, datetime] = {}

_SESSION_TTL = timedelta(hours=2)


def reset() -> None:
    """Clear simulation and sessions.  Used by tests."""
    global _state
    _state = None
    _sessions.clear()


# ── Authentication ─────────────────────────────────────────────────────────


def is_enabled() -> bool:
    """The simulator exists only when a password is configured.

    An unset password disables it outright rather than leaving it open, so a
    deployment that never opted in has no control surface at all.
    """
    return bool(_settings.sports_sim_password)


def create_session(password: str, now: datetime | None = None) -> tuple[str, datetime] | None:
    """Validate *password* and mint a session token, or ``None`` if it's wrong."""
    if not is_enabled():
        return None
    now = now or datetime.now(tz=timezone.utc)
    # Constant-time: a timing oracle on a shared secret is cheap to avoid.
    if not secrets.compare_digest(password, _settings.sports_sim_password):
        return None
    _prune_sessions(now)
    token = secrets.token_urlsafe(32)
    expires = now + _SESSION_TTL
    _sessions[token] = expires
    return token, expires


def valid_session(token: str | None, now: datetime | None = None) -> bool:
    if not token or not is_enabled():
        return False
    now = now or datetime.now(tz=timezone.utc)
    expiry = _sessions.get(token)
    if expiry is None:
        return False
    if now >= expiry:
        del _sessions[token]
        return False
    return True


def _prune_sessions(now: datetime) -> None:
    for token in [t for t, exp in _sessions.items() if now >= exp]:
        del _sessions[token]


# ── Lifecycle ──────────────────────────────────────────────────────────────


def start(
    games: list[SimGame],
    speed: float,
    duration_minutes: float,
    hide_real: bool,
    now: datetime | None = None,
) -> SimState:
    """Begin (or replace) a simulation."""
    global _state
    now = now or datetime.now(tz=timezone.utc)
    duration = min(max(duration_minutes, 1.0), float(_settings.sports_sim_max_minutes))
    _state = SimState(
        games=games,
        started_at=now,
        expires_at=now + timedelta(minutes=duration),
        speed=min(max(speed, MIN_SPEED), MAX_SPEED),
        hide_real=hide_real,
    )
    logger.info(
        "Sports simulation started: %d game(s), speed %.0fx, expires %s",
        len(games),
        _state.speed,
        _state.expires_at.isoformat(),
    )
    return _state


def stop() -> None:
    global _state
    if _state is not None:
        logger.info("Sports simulation stopped")
    _state = None


def current(now: datetime | None = None) -> SimState | None:
    """The running simulation, or ``None``.

    Expiry is enforced here rather than by a timer, so every read path gets the
    fallback to ESPN for free.
    """
    global _state
    if _state is None:
        return None
    now = now or datetime.now(tz=timezone.utc)
    if now >= _state.expires_at:
        logger.info("Sports simulation expired; returning to live ESPN data")
        _state = None
        return None
    return _state


# ── Rendering ──────────────────────────────────────────────────────────────

_ORDINALS = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "OT"}


def _clock(remaining_seconds: float) -> str:
    # Rounded, not truncated: the period boundaries land on values like
    # 599.9999997 after the float division below, and a clock reading "9:59" at
    # the exact halfway point of a hockey game looks like a bug.
    remaining = max(0, round(remaining_seconds))
    return f"{remaining // 60}:{remaining % 60:02d}"


def _phase_detail(league: str, progress: float) -> str:
    """The "where play is at" string, mimicking ESPN's own shortDetail format.

    *progress* runs 0→1 across the game.  Matching ESPN's phrasing exactly means
    the frontend never learns that a slide was simulated.
    """
    p = min(max(progress, 0.0), 0.999999)

    if league == "MLB":
        # 18 half-innings; ESPN says "Top 7th" / "Bot 7th".
        half = int(p * 18)
        inning = half // 2 + 1
        side = "Top" if half % 2 == 0 else "Bot"
        return f"{side} {_inning_ordinal(inning)}"

    if league in ("MLS", "NWSL"):
        return f"{max(1, math.ceil(p * 90))}'"

    if league == "NHL":
        periods, minutes = 3, 20.0
        label = "Period"
    elif league == "NFL":
        periods, minutes = 4, 15.0
        label = "Quarter"
    else:  # NBA and anything unrecognised
        periods, minutes = 4, 12.0
        label = "Quarter"

    span = 1.0 / periods
    index = min(periods, int(p / span) + 1)
    within = (p - (index - 1) * span) / span
    remaining = minutes * 60 * (1 - within)
    # NHL reads "8:24 - 2nd"; the longer label is what ESPN uses for basketball
    # and football, and either way the frontend just prints it.
    if league == "NHL":
        return f"{_clock(remaining)} - {_ORDINALS.get(index, f'{index}th')}"
    return f"{_clock(remaining)} - {_ORDINALS.get(index, f'{index}th')} {label}"


def _inning_ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _progress_score(final: int, progress: float) -> int:
    """Scores climb toward the final, monotonically.

    Deliberately not random: two polls a second apart must never show the score
    going backwards.
    """
    return min(final, int(round(final * min(max(progress, 0.0), 1.0))))


def render(state: SimState, now: datetime | None = None) -> list[GameSlide]:
    """The simulation's games as slides, as of *now*.

    Timestamps are fixed instants on the simulation's own timeline, which the
    response anchors with ``generated_at`` — see the module docstring for why
    they must not be re-derived as offsets from the current moment.
    """
    now = now or datetime.now(tz=timezone.utc)
    elapsed = state.elapsed_virtual_seconds(now)

    slides: list[GameSlide] = []
    for index, game in enumerate(state.games):
        team = TEAMS_BY_KEY.get(game.team_key)
        if team is None:
            continue

        lead = max(0.0, game.lead_minutes) * 60
        duration = max(1.0, game.game_minutes) * 60

        # Both fixed for the life of the simulation, and both on the virtual
        # timeline. The phase below is the only thing that moves.
        start = state.started_at + timedelta(seconds=lead)
        finish = start + timedelta(seconds=duration)

        slide_state: str
        end: datetime | None = None
        detail = ""
        team_score: int | None = None
        opp_score: int | None = None
        result: str | None = None

        if elapsed < lead:
            slide_state = "pre"
        elif elapsed < lead + duration:
            slide_state = "in"
            progress = (elapsed - lead) / duration
            detail = _phase_detail(team.league, progress)
            team_score = _progress_score(game.final_team_score, progress)
            opp_score = _progress_score(game.final_opponent_score, progress)
        else:
            slide_state = "post"
            end = finish
            detail = "Final"
            team_score = game.final_team_score
            opp_score = game.final_opponent_score
            if team_score > opp_score:
                result = "win"
            elif team_score < opp_score:
                result = "loss"
            else:
                result = "draw"

        slides.append(
            GameSlide(
                id=f"sim-{state.run_id}-{index}",
                league=team.league,
                sport_emoji=team.emoji,
                team_key=team.key,
                team_abbr=team.abbr,
                team_name=team.name,
                opponent_abbr=game.opponent_abbr,
                opponent_name=game.opponent_name,
                color=team.color,
                alt_color=team.alt_color,
                state=slide_state,  # type: ignore[arg-type]
                start=start,
                end=end,
                detail=detail,
                team_score=team_score,
                opponent_score=opp_score,
                result=result,  # type: ignore[arg-type]
                venue="Simulated",
                simulated=True,
            )
        )

    return slides
