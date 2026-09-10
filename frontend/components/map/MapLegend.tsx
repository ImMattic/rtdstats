"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { cn, headwayColor } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";

/**
 * Headway colour key for the live map. It mounts as a real Leaflet control in
 * the bottom-right stack, wedged *between* the attribution bar and the zoom
 * buttons, so the three read attribution → legend → zoom from the bottom up and
 * Leaflet keeps them stacked with no hand-tuned offsets. Being a control (rather
 * than a `pointer-events-none` overlay floating over the map) means the grab
 * cursor and map drag stop at its edge instead of treating it as open map.
 *
 * Must be rendered as a child of `<MapContainer>`, *after* `<AttributionControl>`
 * and *before* `<ZoomControl>`: control effects fire in JSX order and Leaflet
 * prepends each bottom control, so that sequence is what yields the
 * zoom / legend / attribution stack. `className` lets the caller hide it on
 * narrow screens while a dialog occupies the same corner.
 */
export default function MapLegend({ className }: { className?: string }) {
  const map = useMap();
  const { resolvedTheme } = useTheme();
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const control = new L.Control({ position: "bottomright" });
    control.onAdd = () => {
      const el = L.DomUtil.create("div");
      // Keep clicks, drags and wheel events on the legend from reaching the map.
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
    <div className="flex cursor-default select-none items-center gap-2 rounded-full border border-line bg-card/90 px-3 py-1.5 text-[11px] text-fg-muted shadow-lg shadow-black/30 backdrop-blur-md">
      <span className="font-medium text-fg-subtle">Headway&nbsp;(min)</span>
      {items.map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1 whitespace-nowrap">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          {label}
        </span>
      ))}
    </div>,
    container,
  );
}
