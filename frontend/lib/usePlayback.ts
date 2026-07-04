"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Whole-trip animation duration (ms of wall-clock) at 1x speed. */
const BASE_DURATION_MS = 30_000;

export interface Playback {
  /** Current playback clock, epoch ms, clamped to [startMs, endMs]. */
  currentMs: number;
  isPlaying: boolean;
  speed: number;
  /** True once the user has interacted (played or scrubbed) at least once. */
  active: boolean;
  /** True when paused on the final sample. */
  atEnd: boolean;
  toggle: () => void;
  seek: (ms: number) => void;
  setSpeed: (speed: number) => void;
  replay: () => void;
}

/**
 * RAF-driven playback clock for the trip track. Advances `currentMs` so the
 * whole [startMs, endMs] span plays over BASE_DURATION_MS at 1x, scaled by
 * `speed`. Pauses on reaching the end. Inert when endMs <= startMs.
 */
export function usePlayback(startMs: number, endMs: number): Playback {
  const [currentMs, setCurrentMs] = useState(startMs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [active, setActive] = useState(false);

  const valid = endMs > startMs;
  const span = endMs - startMs;

  // Reset whenever the trip (its bounds) changes.
  useEffect(() => {
    setCurrentMs(startMs);
    setIsPlaying(false);
    setActive(false);
  }, [startMs, endMs]);

  // Latest values for the RAF loop without re-subscribing every frame.
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying || !valid) return;

    const step = (ts: number) => {
      if (lastTsRef.current != null) {
        const dt = ts - lastTsRef.current;
        const advance = (dt * speedRef.current * span) / BASE_DURATION_MS;
        setCurrentMs((prev) => {
          const next = prev + advance;
          if (next >= endMs) {
            setIsPlaying(false);
            return endMs;
          }
          return next;
        });
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [isPlaying, valid, span, endMs]);

  const atEnd = currentMs >= endMs;

  const toggle = useCallback(() => {
    if (!valid) return;
    setActive(true);
    setIsPlaying((p) => {
      // Restart from the beginning when pressing play at the end.
      if (!p && currentMs >= endMs) setCurrentMs(startMs);
      return !p;
    });
  }, [valid, currentMs, endMs, startMs]);

  const seek = useCallback(
    (ms: number) => {
      if (!valid) return;
      setActive(true);
      setIsPlaying(false);
      setCurrentMs(Math.min(endMs, Math.max(startMs, ms)));
    },
    [valid, startMs, endMs],
  );

  const setSpeed = useCallback((s: number) => setSpeedState(s), []);

  const replay = useCallback(() => {
    if (!valid) return;
    setActive(true);
    setCurrentMs(startMs);
    setIsPlaying(true);
  }, [valid, startMs]);

  return { currentMs, isPlaying, speed, active, atEnd, toggle, seek, setSpeed, replay };
}
