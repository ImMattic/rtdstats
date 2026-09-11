"""Wire format for the home-game carousel.

One ``GameSlide`` is one turn of the map's status carousel.  The backend decides
*what* is true about a game (which phase it is in, the score, the period) and
the frontend decides how to *say* it ("in 45 min", "won 20 min ago") — anything
that has to tick between polls is derived client-side from ``start`` / ``end``
rather than baked into a string that would go stale five seconds later.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

GameState = Literal["pre", "in", "post"]
GameResult = Literal["win", "loss", "draw"]


class GameSlide(BaseModel):
    """A single home game, in whatever phase it is currently in."""

    id: str
    # Display league name, e.g. "NHL".
    league: str
    sport_emoji: str

    # Our team (always the home side — away games don't move Denver ridership).
    team_key: str
    team_abbr: str
    team_name: str
    opponent_abbr: str
    opponent_name: str

    # Brand colours, hex without '#'.  ESPN's values when it supplies them,
    # otherwise the fallback table in services/sports.py.
    color: str
    alt_color: str

    state: GameState
    # Kickoff/puck-drop.  Always tz-aware UTC.
    start: datetime
    # When the game ended.  Only set once state == "post"; the frontend needs it
    # to say how long ago, and to drop the slide once it is two hours stale.
    end: datetime | None = None

    # ESPN's own phase string — "8:24 - 2nd", "Top 7th", "67'", "Final".
    detail: str = ""
    team_score: int | None = None
    opponent_score: int | None = None
    result: GameResult | None = None
    venue: str | None = None

    simulated: bool = False


class GamesResponse(BaseModel):
    games: list[GameSlide]

    # "Now", on whatever timeline this payload's timestamps live on: server wall
    # time normally, the simulation's virtual clock while one is running.  The
    # frontend anchors to this instead of the visitor's system clock, so it both
    # shrugs off clock skew and follows a sped-up simulation without special
    # cases: virtual_now = generated_at + elapsed_real * clock_rate.
    generated_at: datetime

    # Virtual seconds per real second.  1.0 for live ESPN data; the simulator
    # raises it so a full game plays out in a couple of minutes.
    clock_rate: float = 1.0

    # True when any slide in this payload came from the simulator.
    simulated: bool = False
    # When the simulation gives up and ESPN takes back over.  Real wall-clock
    # time, unlike everything else here — it's a fact about this server, not
    # about the simulated timeline.
    sim_expires_at: datetime | None = None


# ── Simulator control ─────────────────────────────────────────────────────


class SimSessionRequest(BaseModel):
    password: str


class SimSessionResponse(BaseModel):
    token: str
    expires_at: datetime


class SimGameRequest(BaseModel):
    """One scripted game to play out.

    Durations are in *virtual* minutes — at ``speed`` 60 a 60-minute game is
    over in a real minute.
    """

    team_key: str
    opponent_abbr: str = "OPP"
    opponent_name: str = "Opponent"
    lead_minutes: float = 90.0
    game_minutes: float = 150.0
    final_team_score: int = 3
    final_opponent_score: int = 2


class SimStartRequest(BaseModel):
    games: list[SimGameRequest]
    speed: float = 60.0
    # Real minutes before the simulation switches itself off.
    duration_minutes: float = 30.0
    # Whether real ESPN games are suppressed while the simulation runs.
    hide_real: bool = True


class SimStatusResponse(BaseModel):
    active: bool
    started_at: datetime | None = None
    expires_at: datetime | None = None
    speed: float | None = None
    hide_real: bool | None = None
    # Virtual minutes elapsed since the simulation started.
    elapsed_virtual_minutes: float | None = None
    games: list[GameSlide] = []
