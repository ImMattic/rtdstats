"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRoutes, useStopsSearch } from "@/lib/hooks";
import type { StopInfo, VehiclePosition } from "@/lib/types";

interface Props {
  vehicles: VehiclePosition[];
  onSelect: (vehicle: VehiclePosition) => void;
  onSelectStop: (stop: StopInfo) => void;
}

export default function VehicleSearch({ vehicles, onSelect, onSelectStop }: Props) {
  const routes = useRoutes();
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: stopResults } = useStopsSearch(query);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setMobileExpanded(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const sortedRoutes = useMemo(() => {
    const list = routes.data?.routes ?? [];
    return [...list].sort((a, b) =>
      a.short_name.localeCompare(b.short_name, undefined, { numeric: true })
    );
  }, [routes.data]);

  const groupedRoutes = useMemo(() => {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? sortedRoutes.filter(
          (r) =>
            r.short_name.toLowerCase().includes(q) ||
            r.long_name.toLowerCase().includes(q)
        )
      : sortedRoutes;
    const rail = filtered.filter((r) => r.type_name !== "bus" && r.type_name !== "other");
    const bus = filtered.filter((r) => r.type_name === "bus");
    const other = filtered.filter((r) => r.type_name === "other");
    return { rail, bus, other };
  }, [sortedRoutes, query]);

  const stops = query.trim().length >= 2 ? (stopResults?.stops ?? []) : [];

  const totalGroups =
    groupedRoutes.rail.length +
    groupedRoutes.bus.length +
    groupedRoutes.other.length +
    stops.length;

  function handleSelectRoute(routeId: string) {
    const vehicle = vehicles.find((v) => v.route_id === routeId);
    if (vehicle) onSelect(vehicle);
    const route = sortedRoutes.find((r) => r.route_id === routeId);
    setQuery(route ? route.short_name : "");
    setDropdownOpen(false);
  }

  function handleSelectStop(stop: StopInfo) {
    onSelectStop(stop);
    setQuery(stop.stop_name);
    setDropdownOpen(false);
    setMobileExpanded(false);
  }

  function expandMobile() {
    setMobileExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const hasRoutes =
    groupedRoutes.rail.length + groupedRoutes.bus.length + groupedRoutes.other.length > 0;

  return (
    <div ref={containerRef} className="absolute top-3 right-3 z-[1000]">
      {/* Mobile collapsed: icon button */}
      {!mobileExpanded && (
        <button
          className="sm:hidden flex h-11 w-11 items-center justify-center rounded-full bg-gray-900/90 border border-gray-700 text-gray-300 shadow-lg backdrop-blur-sm"
          onClick={expandMobile}
          aria-label="Search routes and stations"
        >
          <SearchIcon />
        </button>
      )}

      {/* Search input — always visible on desktop, shown when expanded on mobile */}
      <div className={`flex-col w-72 ${mobileExpanded ? "flex" : "hidden sm:flex"}`}>
        <div className="flex items-center gap-2 rounded-lg bg-gray-900/90 border border-gray-700 px-3 py-2.5 shadow-lg backdrop-blur-sm">
          <SearchIcon className="text-gray-500 shrink-0" />
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
            className="flex-1 min-w-0 bg-transparent text-base sm:text-sm text-gray-200 placeholder-gray-500 outline-none"
          />
          <button
            onClick={() => {
              setQuery("");
              setDropdownOpen(false);
              setMobileExpanded(false);
            }}
            aria-label="Close search"
            className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ClearIcon />
          </button>
        </div>

        {dropdownOpen && (
          <ul className="mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/95 shadow-lg backdrop-blur-sm">
            {/* ── Routes ───────────────────────────────────────── */}
            {groupedRoutes.rail.length > 0 && (
              <>
                <li className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Rail
                </li>
                {groupedRoutes.rail.map((r) => (
                  <li key={r.route_id}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectRoute(r.route_id)}
                      className="flex w-full items-center gap-3 border-t border-gray-800 px-3 py-2.5 text-left hover:bg-gray-800 transition-colors"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: `#${r.color}` }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-100">{r.short_name}</p>
                        <p className="truncate text-xs text-gray-400">{r.long_name}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </>
            )}
            {groupedRoutes.bus.length > 0 && (
              <>
                <li className={`px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500 ${groupedRoutes.rail.length > 0 ? "border-t border-gray-700" : ""}`}>
                  Bus
                </li>
                {groupedRoutes.bus.map((r) => (
                  <li key={r.route_id}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectRoute(r.route_id)}
                      className="flex w-full items-center gap-3 border-t border-gray-800 px-3 py-2.5 text-left hover:bg-gray-800 transition-colors"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: `#${r.color}` }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-100">{r.short_name}</p>
                        <p className="truncate text-xs text-gray-400">{r.long_name}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </>
            )}
            {groupedRoutes.other.length > 0 && (
              <>
                <li className={`px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500 ${groupedRoutes.rail.length + groupedRoutes.bus.length > 0 ? "border-t border-gray-700" : ""}`}>
                  Other
                </li>
                {groupedRoutes.other.map((r) => (
                  <li key={r.route_id}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectRoute(r.route_id)}
                      className="flex w-full items-center gap-3 border-t border-gray-800 px-3 py-2.5 text-left hover:bg-gray-800 transition-colors"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: `#${r.color}` }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-100">{r.short_name}</p>
                        <p className="truncate text-xs text-gray-400">{r.long_name}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </>
            )}

            {/* ── Stations ─────────────────────────────────────── */}
            {stops.length > 0 && (
              <>
                <li className={`px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500 ${hasRoutes ? "border-t border-gray-700" : ""}`}>
                  Stations
                </li>
                {stops.map((stop) => (
                  <li key={stop.stop_id}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectStop(stop)}
                      className="flex w-full items-center gap-3 border-t border-gray-800 px-3 py-2.5 text-left hover:bg-gray-800 transition-colors"
                    >
                      <span className="shrink-0 text-gray-500">
                        <StationIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-100">{stop.stop_name}</p>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          {stop.stop_desc && (
                            <span className="text-xs text-gray-400 mr-1">{stop.stop_desc}</span>
                          )}
                          {stop.routes.slice(0, 6).map((r) => (
                            <span
                              key={r.route_id}
                              className="inline-block rounded px-1 py-px text-[10px] font-bold text-white leading-tight"
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
              <li className="px-3 py-3 text-sm text-gray-500">No routes or stations found</li>
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
      <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 15.01 17 12.42 17 9A7 7 0 1 0 3 9c0 3.42 1.698 6.01 3.354 7.585.829.799 1.654 1.381 2.274 1.765.311.193.57.337.757.433a5.741 5.741 0 00.281.14l.018.008.006.003zM10 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clipRule="evenodd" />
    </svg>
  );
}
