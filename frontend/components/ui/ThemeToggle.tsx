"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemePreference } from "@/lib/useTheme";

const OPTIONS: { value: ThemePreference; label: string; short: string }[] = [
  { value: "light", label: "First Train", short: "First" },
  { value: "system", label: "Auto", short: "Auto" },
  { value: "dark", label: "Last Train", short: "Last" },
];

function SunIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.2M12 19.8V22M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2 12h2.2M19.8 12H22M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56" />
    </svg>
  );
}

function AutoIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MoonIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

const ICONS: Record<ThemePreference, (p: { className?: string }) => React.ReactElement> = {
  light: SunIcon,
  system: AutoIcon,
  dark: MoonIcon,
};

interface Props {
  className?: string;
  /**
   * "on-brand" — compact icon-only pill styled for the always-red navbar
   * chrome (doesn't itself change with theme, since the bar behind it doesn't).
   * "full" — labelled rows for the mobile menu, themed via tokens.
   */
  variant?: "on-brand" | "full";
}

export default function ThemeToggle({ className = "", variant = "on-brand" }: Props) {
  const { preference, setPreference } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Until mounted we don't know the stored preference; render "system" (the
  // default) so server and first client paint agree.
  const active = mounted ? preference : "system";
  const activeIndex = OPTIONS.findIndex((o) => o.value === active);

  if (variant === "full") {
    return (
      <div className={cn("flex flex-col gap-1", className)} role="radiogroup" aria-label="Theme">
        {OPTIONS.map((o) => {
          const Icon = ICONS[o.value];
          const isActive = o.value === active;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setPreference(o.value)}
              className={cn(
                "flex items-center gap-2.5 rounded-full px-3 py-2 text-sm font-bold transition-colors",
                isActive
                  ? "bg-rtd-darkred text-white"
                  : "text-white/80 hover:bg-rtd-darkred/60 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "press relative grid shrink-0 grid-cols-3 rounded-full border border-rtd-darkred bg-rtd-darkred/40 p-0.5",
        className,
      )}
    >
      {/* Sliding highlight */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0.5 w-[calc(33.333%-2px)] rounded-full bg-white transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(calc(${Math.max(activeIndex, 0)} * (100% + 2px)))` }}
      />
      {OPTIONS.map((o) => {
        const Icon = ICONS[o.value];
        const isActive = o.value === active;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={o.label}
            title={o.label}
            onClick={() => setPreference(o.value)}
            className={cn(
              "relative z-10 grid h-8 w-8 place-items-center rounded-full transition-colors duration-200",
              isActive ? "text-rtd-red" : "text-white/80 hover:text-white",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
