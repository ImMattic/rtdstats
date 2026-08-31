/** Shimmering placeholders shown while a panel's data loads. */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

const BAR_HEIGHTS = [58, 82, 44, 90, 63, 74, 52, 86, 48, 70, 60, 78];

export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="flex items-end gap-2" style={{ height }}>
        {BAR_HEIGHTS.map((h, i) => (
          <div key={i} className="skeleton flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="skeleton h-3 w-1/3" />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line" aria-hidden="true">
      <div className="skeleton h-9 w-full !rounded-none" />
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <div className="skeleton h-4 w-8" />
            <div className="skeleton h-4 flex-1" />
            <div className="skeleton h-4 w-16" />
            <div className="skeleton h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div
      className="rounded-2xl border border-line bg-card p-5 shadow-card"
      aria-hidden="true"
    >
      <div className="skeleton h-3 w-20" />
      <div className="skeleton mt-3 h-8 w-24" />
      <div className="skeleton mt-3 h-3 w-16" />
    </div>
  );
}
