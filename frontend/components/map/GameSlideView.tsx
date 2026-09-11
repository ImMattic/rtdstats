"use client";

import type { GameSlideView as View } from "@/lib/gameSlides";

/**
 * One home-game turn of the map status carousel.
 *
 * Team colour lands on the badge rather than on the pill, and the badge picks
 * its own text colour by measured contrast — Broncos orange and Rockies
 * near-black purple both have to carry three legible letters, in both site
 * themes, without either being special-cased.
 *
 * Everything downstream of `describeGame` is presentation only: this component
 * never computes a countdown, so it can't drift out of step with the clock the
 * rest of the carousel is reading.
 */
export default function GameSlideView({ view }: { view: View }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-tight"
        style={{ backgroundColor: view.color, color: view.textColor }}
      >
        <span aria-hidden="true">{view.emoji}</span>
        {view.badge}
      </span>

      {view.live && (
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-danger motion-reduce:animate-none"
        />
      )}

      <span className="font-medium text-fg-muted">{view.lead}</span>
      {view.score && <span className="font-semibold text-fg">{view.score}</span>}
      <span className="text-fg-subtle">·</span>
      <span className="text-fg-muted">{view.status}</span>
    </span>
  );
}
