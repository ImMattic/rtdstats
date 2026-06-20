"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VehiclePosition } from "@/lib/types";

interface RouteResult {
  kind: "route";
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_color: string;
  count: number;
  sample: VehiclePosition;
}

interface VehicleResult {
  kind: "vehicle";
  vehicle: VehiclePosition;
}

type SearchResult = RouteResult | VehicleResult;

interface Props {
  vehicles: VehiclePosition[];
  onSelect: (vehicle: VehiclePosition) => void;
}

const ROUTE_TYPE_LABELS: Record<string, string[]> = {
  "0": ["light rail", "lrt", "rail", "train", "tram", "route"],
  "1": ["heavy rail", "subway", "metro", "rail", "train", "route"],
  "2": ["commuter rail", "commuter", "rail", "train", "route"],
  "3": ["bus", "motorbus", "route"],
};

export default function VehicleSearch({ vehicles, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setResultsVisible(false);
        setMobileExpanded(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const results: SearchResult[] = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    // Strip "route " prefix so "Route A" → "a" for field matching.
    // Keep the original q for type-label matching ("route" alone still works).
    const stripped = q.startsWith("route ") ? q.slice(6).trim() : "";
    const qField = stripped.length > 0 ? stripped : q;

    const routeMap = new Map<string, RouteResult>();
    const vehicleMatches: VehicleResult[] = [];

    for (const v of vehicles) {
      const typeLabels = ROUTE_TYPE_LABELS[v.route_type] ?? [];
      const routeMatch =
        v.route_short_name?.toLowerCase().includes(qField) ||
        v.route_long_name?.toLowerCase().includes(qField) ||
        typeLabels.some((label) => label.includes(q));

      if (routeMatch) {
        if (!routeMap.has(v.route_id)) {
          routeMap.set(v.route_id, {
            kind: "route",
            route_id: v.route_id,
            route_short_name: v.route_short_name,
            route_long_name: v.route_long_name,
            route_color: v.route_color,
            count: 1,
            sample: v,
          });
        } else {
          routeMap.get(v.route_id)!.count++;
        }
      } else if (
        vehicleMatches.length < 5 &&
        (v.vehicle_label?.toLowerCase().includes(qField) ||
          v.vehicle_id?.toLowerCase().includes(qField))
      ) {
        vehicleMatches.push({ kind: "vehicle", vehicle: v });
      }
    }

    return [...[...routeMap.values()].slice(0, 5), ...vehicleMatches];
  }, [query, vehicles]);

  function handleSelect(result: SearchResult) {
    onSelect(result.kind === "route" ? result.sample : result.vehicle);
    setQuery("");
    setResultsVisible(false);
    setMobileExpanded(false);
  }

  function expandMobile() {
    setMobileExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const showResults = resultsVisible && query.trim().length > 0;

  return (
    <div ref={containerRef} className="absolute top-3 right-3 z-[1000]">
      {/* Mobile collapsed: icon button */}
      {!mobileExpanded && (
        <button
          className="sm:hidden flex h-11 w-11 items-center justify-center rounded-full bg-gray-900/90 border border-gray-700 text-gray-300 shadow-lg backdrop-blur-sm"
          onClick={expandMobile}
          aria-label="Search vehicles"
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
              setResultsVisible(true);
            }}
            onFocus={() => setResultsVisible(true)}
            placeholder="Search route or vehicle…"
            // text-base (16px) on mobile prevents iOS auto-zoom on focus
            className="flex-1 min-w-0 bg-transparent text-base sm:text-sm text-gray-200 placeholder-gray-500 outline-none"
          />
          <button
            onClick={() => {
              setQuery("");
              setResultsVisible(false);
              setMobileExpanded(false);
            }}
            aria-label="Clear search"
            className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ClearIcon />
          </button>
        </div>

        {showResults && results.length > 0 && (
          <ul className="mt-1 overflow-hidden rounded-lg border border-gray-700 bg-gray-900/90 shadow-lg backdrop-blur-sm">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  onClick={() => handleSelect(r)}
                  className="flex w-full items-center gap-3 border-b border-gray-800 px-3 py-2.5 text-left last:border-0 hover:bg-gray-800 transition-colors"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{
                      backgroundColor: `#${r.kind === "route" ? r.route_color : r.vehicle.route_color}`,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    {r.kind === "route" ? (
                      <>
                        <p className="text-sm font-semibold text-gray-100">
                          Route {r.route_short_name}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {r.route_long_name} · {r.count} vehicle{r.count !== 1 ? "s" : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-gray-100">
                          {r.vehicle.route_short_name}
                          {r.vehicle.vehicle_label && ` · #${r.vehicle.vehicle_label}`}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {r.vehicle.stop_name
                            ? `${r.vehicle.current_status_label ?? ""} ${r.vehicle.stop_name}`.trim()
                            : r.vehicle.route_long_name}
                        </p>
                      </>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-gray-600">
                    {r.kind === "route" ? "Route" : "Vehicle"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {showResults && results.length === 0 && (
          <div className="mt-1 rounded-lg border border-gray-700 bg-gray-900/90 px-3 py-3 shadow-lg backdrop-blur-sm">
            <p className="text-sm text-gray-500">No results</p>
          </div>
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
