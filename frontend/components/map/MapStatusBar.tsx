"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRoutes, useStopsSearch } from "@/lib/hooks";
import type { StopInfo, VehiclePosition } from "@/lib/types";
import { cn, headwayColor } from "@/lib/utils";

interface Props {
  vehicles: VehiclePosition[];
  vehicleCount: number;
  routeCount: number;
  isLoading: boolean;
  isError: boolean;
  dataUpdatedAt: number;
  onSelect: (vehicle: VehiclePosition) => void;
  onSelectStop: (stop: StopInfo) => void;
}

/** Headway colour key — same buckets used by the map markers. */
const LEGEND = [
  { label: "<15", color: headwayColor(10) },
  { label: "20", color: headwayColor(18) },
  { label: "30", color: headwayColor(25) },
  { label: "40", color: headwayColor(35) },
  { label: "50", color: headwayColor(45) },
  { label: "60+", color: headwayColor(99) },
] as const;

const CYCLE_COUNT = 3;
const SEARCH_WIDTH = "min(90vw, 23rem)";

export default function MapStatusBar({
  vehicles,
  vehicleCount,
  routeCount,
  isLoading,
  isError,
  dataUpdatedAt,
  onSelect,
  onSelectStop,
}: Props) {
  const [mode, setMode] = useState<"status" | "search">("status");
  const [cycle, setCycle] = useState(0);
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const anchorRef = useRef<HTMLDivElement>(null);
  const statusRowRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const routes = useRoutes();
  const { data: stopResults } = useStopsSearch(query);

  // Pill width follows the status content so it hugs whatever the current
  // cycle state needs, then animates to the wide search field on takeover.
  const [statusWidth, setStatusWidth] = useState<number>();

  useEffect(() => {
    if (mode !== "status" || !statusRowRef.current) return;
    const measure = () => {
      if (statusRowRef.current) setStatusWidth(statusRowRef.current.scrollWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [mode, cycle, vehicleCount, routeCount, dataUpdatedAt, isLoading, isError]);

  const openSearch = useCallback(() => {
    setMode("search");
    setDropdownOpen(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const closeSearch = useCallback(() => {
    setMode("status");
    setQuery("");
    setDropdownOpen(false);
  }, []);

  const advance = useCallback(() => setCycle((c) => (c + 1) % CYCLE_COUNT), []);

  useEffect(() => {
    if (mode !== "search") return;
    function handleOutsideClick(e: MouseEvent) {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        closeSearch();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeSearch();
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [mode, closeSearch]);

  const sortedRoutes = useMemo(() => {
    const list = routes.data?.routes ?? [];
    return [...list].sort((a, b) =>
      a.short_name.localeCompare(b.short_name, undefined, { numeric: true }),
    );
  }, [routes.data]);

  const groupedRoutes = useMemo(() => {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? sortedRoutes.filter(
          (r) =>
            r.short_name.toLowerCase().includes(q) ||
            r.long_name.toLowerCase().includes(q),
        )
      : sortedRoutes;
    const rail = filtered.filter(
      (r) => r.type_name !== "bus" && r.type_name !== "other",
    );
    const bus = filtered.filter((r) => r.type_name === "bus");
    const other = filtered.filter((r) => r.type_name === "other");
    return { rail, bus, other };
  }, [sortedRoutes, query]);

  const stops = query.trim().length >= 2 ? stopResults?.stops ?? [] : [];
  const hasRoutes =
    groupedRoutes.rail.length +
      groupedRoutes.bus.length +
      groupedRoutes.other.length >
    0;
  const totalGroups =
    groupedRoutes.rail.length +
    groupedRoutes.bus.length +
    groupedRoutes.other.length +
    stops.length;

  function handleSelectRoute(routeId: string) {
    const vehicle = vehicles.find((v) => v.route_id === routeId);
    if (vehicle) onSelect(vehicle);
    closeSearch();
  }

  function handleSelectStop(stop: StopInfo) {
    onSelectStop(stop);
    closeSearch();
  }

  // ── Cycle content ─────────────────────────────────────────────────────
  const cycleBody = () => {
    if (cycle === 0) {
      return (
        <span className="flex items-center gap-2 font-medium text-gray-200">
          <span
            className={cn(
              "inline-block h-2 w-2 shrink-0 rounded-full",
              isError
                ? "bg-red-500"
                : isLoading
                  ? "bg-amber-400"
                  : "bg-emerald-400",
            )}
          />
          {isLoading
            ? "Connecting…"
            : isError
              ? "Feed unavailable"
              : `${vehicleCount} vehicles · ${routeCount} routes`}
        </span>
      );
    }
    if (cycle === 1) {
      return (
        <span className="text-xs text-gray-300">
          {dataUpdatedAt
            ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}`
            : "Awaiting data…"}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
        <span className="text-gray-500">Headway</span>
        {LEGEND.map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border-2"
              style={{ borderColor: color }}
            />
            {label}
          </span>
        ))}
      </span>
    );
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-[1000] flex justify-center px-3">
      <div ref={anchorRef} className="pointer-events-auto relative flex items-center">
        {/* Search — separate button on the left; expands to take over the info box */}
        <div
          className="flex h-9 shrink-0 items-center overflow-hidden rounded-full border border-surface-border bg-surface-card/90 shadow-lg shadow-black/30 backdrop-blur-md transition-[width,margin] duration-300 ease-out"
          style={{
            width: mode === "search" ? SEARCH_WIDTH : "2.25rem",
            marginRight: mode === "search" ? 0 : "0.5rem",
            maxWidth: "calc(100vw - 1.5rem)",
          }}
        >
          {mode === "status" ? (
            <button
              type="button"
              onClick={openSearch}
              aria-label="Search routes and stations"
              className="flex h-9 w-9 shrink-0 items-center justify-center text-gray-400 transition-colors hover:text-gray-200"
            >
              <SearchIcon />
            </button>
          ) : (
            <div className="animate-search-in flex w-full items-center gap-2 px-3">
              <SearchIcon className="shrink-0 text-gray-500" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                placeholder="Search route or station…"
                className="min-w-0 flex-1 bg-transparent text-base text-gray-200 placeholder-gray-500 outline-none sm:text-sm"
              />
              <button
                type="button"
                onClick={closeSearch}
                aria-label="Close search"
                className="shrink-0 text-gray-500 transition-colors hover:text-gray-300"
              >
                <ClearIcon />
              </button>
            </div>
          )}
        </div>

        {/* Info box — tap to cycle; collapses when search takes over */}
        <div
          className={cn(
            "group flex h-9 shrink-0 items-center overflow-hidden rounded-full border border-surface-border bg-surface-card/90 text-sm text-gray-300 shadow-lg shadow-black/30 backdrop-blur-md transition-[width,opacity,background-color,border-color,box-shadow] duration-300 ease-out",
            mode === "search"
              ? "pointer-events-none"
              : "cursor-pointer hover:border-gray-500 hover:bg-surface-card hover:shadow-black/40",
          )}
          style={{
            width:
              mode === "search"
                ? 0
                : statusWidth
                  ? statusWidth + 2
                  : undefined,
            opacity: mode === "search" ? 0 : 1,
            maxWidth: "calc(100vw - 1.5rem)",
          }}
          aria-hidden={mode === "search"}
        >
          <button
            ref={statusRowRef}
            type="button"
            onClick={advance}
            aria-label="Cycle map info"
            tabIndex={mode === "search" ? -1 : 0}
            className="flex items-center gap-2 whitespace-nowrap px-3 transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            <span key={cycle} className="animate-cycle-in inline-flex items-center">
              {cycleBody()}
            </span>
            <CycleIcon className="shrink-0 text-gray-500 transition-colors duration-200 group-hover:text-gray-200" />
          </button>
        </div>

        {mode === "search" && dropdownOpen && (
          <ul
            className="absolute left-1/2 top-full z-[1001] mt-2 max-h-80 -translate-x-1/2 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/95 shadow-lg backdrop-blur-sm"
            style={{ width: SEARCH_WIDTH }}
          >
            {(
              [
                ["Rail", groupedRoutes.rail, false],
                ["Bus", groupedRoutes.bus, groupedRoutes.rail.length > 0],
                [
                  "Other",
                  groupedRoutes.other,
                  groupedRoutes.rail.length + groupedRoutes.bus.length > 0,
                ],
              ] as const
            ).map(([label, list, divider]) =>
              list.length > 0 ? (
                <Fragment key={label}>
                  <li
                    className={cn(
                      "px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500",
                      divider && "border-t border-gray-700",
                    )}
                  >
                    {label}
                  </li>
                  {list.map((r) => (
                    <li key={r.route_id}>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectRoute(r.route_id)}
                        className="flex w-full items-center gap-3 border-t border-gray-800 px-3 py-2.5 text-left transition-colors hover:bg-gray-800"
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: `#${r.color}` }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-100">
                            {r.short_name}
                          </p>
                          <p className="truncate text-xs text-gray-400">
                            {r.long_name}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </Fragment>
              ) : null,
            )}

            {stops.length > 0 && (
              <>
                <li
                  className={cn(
                    "px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500",
                    hasRoutes && "border-t border-gray-700",
                  )}
                >
                  Stations
                </li>
                {stops.map((stop) => (
                  <li key={stop.stop_id}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectStop(stop)}
                      className="flex w-full items-center gap-3 border-t border-gray-800 px-3 py-2.5 text-left transition-colors hover:bg-gray-800"
                    >
                      <span className="shrink-0 text-gray-500">
                        <StationIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-100">
                          {stop.stop_name}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          {stop.stop_desc && (
                            <span className="mr-1 text-xs text-gray-400">
                              {stop.stop_desc}
                            </span>
                          )}
                          {stop.routes.slice(0, 6).map((r) => (
                            <span
                              key={r.route_id}
                              className="inline-block rounded px-1 py-px text-[10px] font-bold leading-tight text-white"
                              style={{ backgroundColor: `#${r.color || "888888"}` }}
                            >
                              {r.short_name}
                            </span>
                          ))}
                          {stop.routes.length > 6 && (
                            <span className="text-[10px] text-gray-500">
                              +{stop.routes.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </>
            )}

            {totalGroups === 0 && (
              <li className="px-3 py-3 text-sm text-gray-500">
                No routes or stations found
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 ${className}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CycleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 ${className}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}

function StationIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 15.01 17 12.42 17 9A7 7 0 1 0 3 9c0 3.42 1.698 6.01 3.354 7.585.829.799 1.654 1.381 2.274 1.765.311.193.57.337.757.433a5.741 5.741 0 00.281.14l.018.008.006.003zM10 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
        clipRule="evenodd"
      />
    </svg>
  );
}
