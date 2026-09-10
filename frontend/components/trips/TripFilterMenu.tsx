"use client";

import {
  FilterChips,
  FilterOptionList,
  FilterRange,
  FilterSection,
  FilterToggle,
  withSelectedOptions,
  type ChipOption,
  type ListOption,
} from "@/components/ui/FilterControls";
import type { TripFilters } from "@/lib/tripFilters";
import { countActiveTripFilters } from "@/lib/tripFilters";
import { modeOf } from "@/lib/mapFilters";
import type { RouteInfo, TripFacets } from "@/lib/types";
import { occupancyLabel, OCCUPANCY_ORDER, routeColor } from "@/lib/utils";

interface Props {
  open: boolean;
  value: TripFilters;
  onChange: (next: TripFilters) => void;
  /** Per-option counts for the loaded window; undefined while the first load runs. */
  facets?: TripFacets;
  /** Every RTD route, from the static GTFS bundle. */
  routes: RouteInfo[];
  onReset: () => void;
  /** Stages the current edits as chips — the table doesn't move until "Load trips". */
  onApply: () => void;
  /** Greyed out until the draft differs from what's already staged as chips. */
  applyDisabled?: boolean;
}

const MODE_LABELS: Record<string, string> = {
  rail: "Rail",
  bus: "Bus",
  other: "Other",
};

const MODE_ORDER = ["rail", "bus", "other"];

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  complete: "Complete",
  incomplete: "Incomplete",
};

const DURATION_PRESETS = [
  { label: "Under 15 min", min: null, max: 15 },
  { label: "15–45 min", min: 15, max: 45 },
  { label: "45–90 min", min: 45, max: 90 },
  { label: "90 min+", min: 90, max: null },
];

/** The multi-select groups — every `TripFilters` key holding a list of values. */
type TripFilterListKey = Exclude<
  { [K in keyof TripFilters]: TripFilters[K] extends string[] ? K : never }[keyof TripFilters],
  undefined
>;

/**
 * The Trip Explorer's filter drawer.
 *
 * It drops out of the filter bar rather than floating over it, because the date
 * range above stays part of the same decision — you pick a window and then say
 * what you want out of it. "Apply filters" only stages the edits as removable
 * chips; nothing is queried until "Load trips" up in the bar, which also closes
 * this menu. As groups are narrowed, options that can no longer match drop out
 * of the other lists — pick "Rail" and the buses leave the route list.
 */
export default function TripFilterMenu({
  open,
  value,
  onChange,
  facets,
  routes,
  onReset,
  onApply,
  applyDisabled,
}: Props) {
  const activeCount = countActiveTripFilters(value);

  function toggle(key: TripFilterListKey, option: string) {
    const list = value[key] as string[];
    const next = list.includes(option)
      ? list.filter((v) => v !== option)
      : [...list, option];
    onChange({ ...value, [key]: next } as TripFilters);
  }

  function setMany(key: TripFilterListKey, options: string[], on: boolean) {
    const list = value[key] as string[];
    const next = on
      ? [...new Set([...list, ...options])]
      : list.filter((v) => !options.includes(v));
    onChange({ ...value, [key]: next } as TripFilters);
  }

  const statusOptions: ChipOption[] = ["in_progress", "complete", "incomplete"].map((s) => ({
    value: s,
    label: STATUS_LABELS[s],
    count: facets?.statuses[s],
  }));

  const modeOptions: ChipOption[] = MODE_ORDER.map((m) => ({
    value: m,
    label: MODE_LABELS[m],
    count: facets?.modes[m],
  }));

  const occupancyOptions: ChipOption[] = OCCUPANCY_ORDER.map((key) => ({
    value: key,
    label: occupancyLabel(key),
    count: facets?.occupancy[key] ?? 0,
  }));

  // Cross-filtering: a mode pick hides routes/vehicles of the other modes, and a
  // route pick hides vehicles that never served it. Rows already ticked survive
  // (withSelectedOptions) so a selection made before the narrowing can still be
  // undone.
  const modeFilter = new Set<string>(value.modes);
  const selectedRouteShortNames = new Set(
    routes.filter((r) => value.routeIds.includes(r.route_id)).map((r) => r.short_name),
  );
  const routeMatchesMode = (r: RouteInfo) =>
    modeFilter.size === 0 || modeFilter.has(modeOf(r.route_type));

  // Routes come from the static bundle, not the facets: the API applies a route
  // filter in SQL, so once one is set the facets only know about the routes
  // already chosen — and a list that shrinks to your own selection can't be
  // added to. Counts are overlaid where they still describe the whole window.
  const tripCountByRoute = new Map<string, number>(
    facets && !facets.route_scoped
      ? facets.routes.map((r): [string, number] => [r.route_id, r.trip_count])
      : [],
  );
  const routeOptions: ListOption[] = withSelectedOptions(
    routes.filter(routeMatchesMode).map((r) => ({
      value: r.route_id,
      label: r.short_name || r.route_id,
      sublabel: r.long_name,
      dotColor: routeColor(r.color),
      count: tripCountByRoute.get(r.route_id),
      group: MODE_LABELS[r.type_name === "bus" || r.type_name === "other" ? r.type_name : "rail"],
    })),
    value.routeIds,
    (routeId) => ({ value: routeId, label: routeId, sublabel: "Not in the current GTFS bundle" }),
  );

  const vehicleOptions: ListOption[] = withSelectedOptions(
    (facets?.vehicles ?? [])
      .filter((v) => modeFilter.size === 0 || modeFilter.has(v.mode))
      .filter(
        (v) =>
          selectedRouteShortNames.size === 0 ||
          v.route_short_names.some((s) => selectedRouteShortNames.has(s)),
      )
      .map((v) => ({
      value: v.vehicle_label,
      label: `#${v.vehicle_label}`,
      sublabel:
        v.route_short_names.length > 1
          ? `${v.trip_count} trips · routes ${v.route_short_names.join(", ")}`
          : `${v.trip_count} trip${v.trip_count === 1 ? "" : "s"}`,
      badge: v.route_short_names.length > 0
        ? {
            text:
              v.route_short_names.length > 1
                ? `${v.route_short_names[0]} +${v.route_short_names.length - 1}`
                : v.route_short_names[0],
            color: routeColor(v.route_color ?? "888888"),
          }
        : undefined,
      group: MODE_LABELS[v.mode] ?? "Other",
    })),
    value.vehicleLabels,
    (label) => ({ value: label, label: `#${label}`, sublabel: "Not in this window" }),
  );

  const groupRank = (label: string) =>
    MODE_ORDER.findIndex((m) => MODE_LABELS[m] === label);
  const byGroup = (a: ListOption, b: ListOption) =>
    groupRank(a.group ?? "") - groupRank(b.group ?? "");

  return (
    <div className="collapsible" data-open={open}>
      <div className="collapsible-inner">
        <div className="mt-4 rounded-lg border border-line bg-raised/40 px-4 pb-4 pt-1">
          <div className="grid gap-x-8 sm:grid-cols-2">
            <div>
              <FilterSection
                title="Trip status"
                activeCount={value.statuses.length}
                hint="In progress means the vehicle is still reporting positions on this run."
                defaultOpen
              >
                <FilterChips
                  options={statusOptions}
                  selected={value.statuses}
                  onToggle={(v) => toggle("statuses", v)}
                />
              </FilterSection>

              <FilterSection title="Mode" activeCount={value.modes.length} defaultOpen>
                <FilterChips
                  options={modeOptions}
                  selected={value.modes}
                  onToggle={(v) => toggle("modes", v)}
                  hideEmpty
                />
              </FilterSection>

              <FilterSection
                title="Duration"
                activeCount={
                  value.minDurationMinutes !== null || value.maxDurationMinutes !== null ? 1 : 0
                }
                hint={
                  facets
                    ? `Longest trip in this window: ${Math.round(facets.max_duration_minutes)} min.`
                    : "Measured first sighting to last, not scheduled running time."
                }
              >
                <FilterRange
                  min={value.minDurationMinutes}
                  max={value.maxDurationMinutes}
                  unit="min"
                  presets={DURATION_PRESETS}
                  onChange={(min, max) =>
                    onChange({ ...value, minDurationMinutes: min, maxDurationMinutes: max })
                  }
                />
              </FilterSection>

              <FilterSection title="Window" activeCount={value.strict ? 1 : 0}>
                <FilterToggle
                  label="Whole trips only"
                  hint="Drop trips that started before the window or ran past its end."
                  checked={value.strict}
                  onChange={(strict) => onChange({ ...value, strict })}
                />
              </FilterSection>
            </div>

            <div>
              <FilterSection title="Routes" activeCount={value.routeIds.length} defaultOpen>
                <FilterOptionList
                  options={[...routeOptions].sort(byGroup)}
                  selected={value.routeIds}
                  onToggle={(v) => toggle("routeIds", v)}
                  onSetMany={(values, on) => setMany("routeIds", values, on)}
                  searchPlaceholder="Search routes…"
                  emptyLabel={
                    facets ? "No routes match that search." : "Load a window to see its routes."
                  }
                />
              </FilterSection>

              <FilterSection
                title="Vehicles"
                activeCount={value.vehicleLabels.length}
                hint="Fleet numbers that ran in this window, with the routes they served."
              >
                <FilterOptionList
                  options={[...vehicleOptions].sort(byGroup)}
                  selected={value.vehicleLabels}
                  onToggle={(v) => toggle("vehicleLabels", v)}
                  onSetMany={(values, on) => setMany("vehicleLabels", values, on)}
                  searchPlaceholder="Search vehicle or route…"
                  emptyLabel={
                    facets ? "No vehicles match that search." : "Load a window to see its vehicles."
                  }
                />
              </FilterSection>

              <FilterSection
                title="Occupancy"
                activeCount={value.occupancy.length}
                hint="The last crowding level the vehicle reported on this trip."
              >
                <FilterChips
                  options={occupancyOptions}
                  selected={value.occupancy}
                  onToggle={(v) => toggle("occupancy", v)}
                  hideEmpty
                />
              </FilterSection>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={onReset}
              disabled={activeCount === 0}
              className="press rounded-md border border-line px-3 py-2 text-sm font-medium text-fg-muted transition-[transform,background-color,border-color,color] duration-150 hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset filters
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={applyDisabled}
              className="press rounded-md bg-accent px-4 py-2 text-sm font-bold text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
