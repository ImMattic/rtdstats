"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";
import { cn, headwayColor } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";

/**
 * The map's bottom-right corner, below the attribution bar: a legend button
 * on the left that expands into the headway colour key, and — on wide enough
 * screens — the zoom in/out pair (stacked vertically) on the right. Both are
 * custom-built rather than react-leaflet's `<ZoomControl>` / a plain overlay
 * so they can share one row and one rounded-pill material, matching the
 * search button and info pill in `MapStatusBar`. Being a real Leaflet control
 * (not a `pointer-events-none` overlay) means the grab cursor and map drag
 * stop at its edge.
 *
 * The row is bottom-aligned so the legend button sits level with the "−"
 * button, right above attribution, rather than centered against the taller
 * zoom stack.
 *
 * The legend pill expands the same way the status bar's search field does — a
 * fixed-height, `overflow-hidden` capsule whose `width` tweens to a measured
 * pixel value — but here the key text stays mounted the whole time and is
 * simply revealed as the capsule widens, since there's no input to focus. The
 * whole pill is one plain toggle button: a click opens it and it stays open
 * — no outside-click or hover dismissal — until it's clicked again, so it
 * behaves the same on every device.
 *
 * Must be rendered as a child of `<MapContainer>`, *after* `<AttributionControl>`:
 * control effects fire in JSX order and Leaflet prepends each bottom control,
 * so that sequence stacks this row above attribution. `className` lets the
 * caller hide it on narrow screens while a dialog occupies the same corner.
 */
export default function MapCornerControls({ className }: { className?: string }) {
  const map = useMap();
  const { resolvedTheme } = useTheme();
  const [container, setContainer] = useState<HTMLElement | null>(null);

  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const atMinZoom = zoom <= map.getMinZoom();
  const atMaxZoom = zoom >= map.getMaxZoom();

  const [open, setOpen] = useState(false);

  const legendRowRef = useRef<HTMLDivElement>(null);
  const [legendWidth, setLegendWidth] = useState<number>();

  useEffect(() => {
    const control = new L.Control({ position: "bottomright" });
    control.onAdd = () => {
      const el = L.DomUtil.create("div");
      // Keep clicks, drags and wheel events on the controls from reaching the map.
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
      return el;
    };
    control.addTo(map);
    setContainer(control.getContainer() ?? null);
    return () => {
      control.remove();
    };
  }, [map]);

  useEffect(() => {
    if (container) container.className = cn("leaflet-control", className);
  }, [container, className]);

  // The key's text is fixed regardless of theme, so one measurement (taken
  // once the row is actually in the DOM) is all the expanded width needs.
  useEffect(() => {
    if (legendRowRef.current) setLegendWidth(legendRowRef.current.scrollWidth);
  }, [container]);

  const items = useMemo(
    () =>
      [
        { label: "<15", sample: 10 },
        { label: "≥15", sample: 20 },
        { label: "≥30", sample: 45 },
        { label: "≥60", sample: 90 },
      ].map((it) => ({ ...it, color: headwayColor(it.sample, resolvedTheme) })),
    [resolvedTheme],
  );

  if (!container) return null;

  return createPortal(
    <div className="flex items-end gap-2">
      {/* Legend — icon-only pill that widens into the colour key. The whole
          pill is one button: a click anywhere on it opens it, and it stays
          open — no outside-click dismissal — until it's clicked again. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Hide headway colour key" : "Show headway colour key"}
        className="flex h-9 shrink-0 cursor-pointer select-none items-center overflow-hidden rounded-full border border-line-strong bg-card/90 text-fg shadow-card backdrop-blur-md transition-[width] duration-300 ease-out"
        style={{ width: open ? legendWidth : 36 }}
      >
        <div className="flex items-center whitespace-nowrap">
          {/* Only shown collapsed — the unfurled pill drops the icon in favor
              of the key itself. */}
          {!open && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center text-fg-subtle">
              <LegendIcon />
            </span>
          )}
          <div
            ref={legendRowRef}
            aria-hidden={!open}
            className="flex items-center gap-2 px-3 text-[11px]"
          >
            <span className="font-medium text-fg-muted">Freq.&nbsp;(min)</span>
            {items.map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1 whitespace-nowrap">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>
      </button>

      {/* Zoom in/out — stacked vertically, dropped on mobile where pinch /
          double-tap-drag zoom is the norm; the legend pill takes its place
          in the corner there. */}
      <div className="hidden w-9 shrink-0 flex-col items-center overflow-hidden rounded-full border border-line-strong bg-card/90 text-fg shadow-card backdrop-blur-md sm:flex">
        <button
          type="button"
          onClick={() => map.zoomIn()}
          disabled={atMaxZoom}
          aria-label="Zoom in"
          className="flex h-9 w-9 items-center justify-center border-b border-line-strong transition-colors hover:bg-raised/80 disabled:pointer-events-none disabled:text-fg-subtle disabled:opacity-40"
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          onClick={() => map.zoomOut()}
          disabled={atMinZoom}
          aria-label="Zoom out"
          className="flex h-9 w-9 items-center justify-center transition-colors hover:bg-raised/80 disabled:pointer-events-none disabled:text-fg-subtle disabled:opacity-40"
        >
          <MinusIcon />
        </button>
      </div>
    </div>,
    container,
  );
}

/** Three swatches + three lines — reads as a colour key at a glance. */
function LegendIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="6" r="1.6" />
      <circle cx="5" cy="10" r="1.6" />
      <circle cx="5" cy="14" r="1.6" />
      <rect x="9" y="5.2" width="7" height="1.6" rx="0.8" />
      <rect x="9" y="9.2" width="7" height="1.6" rx="0.8" />
      <rect x="9" y="13.2" width="7" height="1.6" rx="0.8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M9.25 4a.75.75 0 0 1 1.5 0v5.25H16a.75.75 0 0 1 0 1.5h-5.25V16a.75.75 0 0 1-1.5 0v-5.25H4a.75.75 0 0 1 0-1.5h5.25V4Z" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M4 9.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75a.75.75 0 0 1-.75-.75Z" />
    </svg>
  );
}
