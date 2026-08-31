"use client";
import type { Playback } from "@/lib/usePlayback";

const SPEEDS = [1, 1.5, 2, 2.5, 3];

function clockWithSeconds(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface Props {
  playback: Playback;
  startMs: number;
  endMs: number;
  /** Route color hex (no leading #) used to tint the active controls. */
  routeColor: string;
}

export default function TripPlaybackControls({ playback, startMs, endMs, routeColor }: Props) {
  const { currentMs, isPlaying, speed, atEnd, toggle, seek, setSpeed, replay } = playback;
  const accent = `#${routeColor.replace(/^#/, "")}`;

  const progress = endMs > startMs ? ((currentMs - startMs) / (endMs - startMs)) * 100 : 0;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={atEnd && !isPlaying ? replay : toggle}
          aria-label={atEnd && !isPlaying ? "Replay" : isPlaying ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition hover:opacity-90"
          style={{ backgroundColor: accent }}
        >
          {atEnd && !isPlaying ? (
            // Replay
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" />
            </svg>
          ) : isPlaying ? (
            // Pause
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            // Play
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <input
          type="range"
          min={startMs}
          max={endMs}
          step={1000}
          value={currentMs}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Playback timeline"
          className="rtd-range h-1.5 flex-1 cursor-pointer rounded-full"
          style={{
            color: accent,
            background: `linear-gradient(to right, ${accent} 0%, ${accent} ${progress}%, rgb(var(--line)) ${progress}%, rgb(var(--line)) 100%)`,
          }}
        />

        <span className="shrink-0 font-mono text-xs tabular-nums text-fg-muted">
          {clockWithSeconds(currentMs)} / {clockWithSeconds(endMs)}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="mr-1 text-xs text-fg-subtle">Speed</span>
        {SPEEDS.map((s) => {
          const isActive = s === speed;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`press rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isActive
                  ? "text-white"
                  : "bg-card-muted text-fg-muted hover:bg-line"
              }`}
              style={isActive ? { backgroundColor: accent } : undefined}
            >
              {s}x
            </button>
          );
        })}
      </div>
    </div>
  );
}
