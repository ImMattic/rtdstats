interface Props {
  label?: string;
  /** Fill the viewport (used by the boot splash). Otherwise fills its parent. */
  fullscreen?: boolean;
}

const STATIONS = [24, 90, 166, 232];

/**
 * Branded loading animation: a route line with pulsing stations and a train
 * bullet shuttling along it. Pure CSS/SVG, theme-token coloured (via inline
 * `style` so `var()` resolves), and calmed by prefers-reduced-motion in
 * globals.css.
 */
export default function TransitLoader({
  label = "Loading live transit data",
  fullscreen = false,
}: Props) {
  return (
    <div
      className={
        fullscreen
          ? "flex h-full min-h-screen w-full flex-col items-center justify-center gap-7 bg-canvas"
          : "flex min-h-[55vh] flex-1 flex-col items-center justify-center gap-7"
      }
    >
      <div className="flex items-baseline gap-0.5 font-display text-3xl font-extrabold tracking-tight text-fg">
        RTD<span className="text-rtd-gold">stats</span>
      </div>

      <div className="relative h-12 w-64">
        <svg
          viewBox="0 0 256 12"
          className="absolute left-0 top-1/2 h-3 w-full -translate-y-1/2 overflow-visible"
          aria-hidden="true"
        >
          <line
            x1="4"
            y1="6"
            x2="252"
            y2="6"
            strokeWidth="4"
            strokeLinecap="round"
            style={{ stroke: "rgb(var(--line))" }}
          />
          <line
            x1="4"
            y1="6"
            x2="252"
            y2="6"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="4 12"
            style={{ stroke: "rgb(var(--accent))", animation: "track-dash 0.8s linear infinite" }}
          />
          {STATIONS.map((cx, i) => (
            <circle
              key={cx}
              cx={cx}
              cy="6"
              r="4"
              strokeWidth="2"
              style={{
                fill: "rgb(var(--canvas))",
                stroke: "rgb(var(--fg-subtle))",
                transformBox: "fill-box",
                transformOrigin: "center",
                animation: `pulse-ring 1.6s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </svg>

        <div className="absolute inset-x-0 top-1/2 h-6 -translate-y-1/2">
          <div
            className="absolute top-0 h-6 w-9 rounded-md border-2"
            style={{
              background: "rgb(var(--accent))",
              borderColor: "rgb(var(--accent-contrast))",
              boxShadow: "0 0 18px 2px rgb(var(--accent) / 0.45)",
              animation:
                "train-run 2s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate",
            }}
            aria-hidden="true"
          >
            <span className="absolute inset-y-1 left-1 w-1.5 rounded-[2px] bg-white/70" />
            <span className="absolute inset-y-1 left-3.5 w-1.5 rounded-[2px] bg-white/70" />
          </div>
        </div>
      </div>

      <p className="loading-dots text-sm text-fg-muted">{label}</p>
    </div>
  );
}
