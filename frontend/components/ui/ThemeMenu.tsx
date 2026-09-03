"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemePreference } from "@/lib/useTheme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "First Train" },
  { value: "system", label: "Auto" },
  { value: "dark", label: "Last Train" },
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

function GithubIcon({ className = "" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

const ICONS: Record<ThemePreference, (p: { className?: string }) => React.ReactElement> = {
  light: SunIcon,
  system: AutoIcon,
  dark: MoonIcon,
};

const GITHUB_URL = "https://github.com/ImMattic/rtdstats";

/**
 * Navbar theme control. Collapsed, it's a single icon button on a soft chip
 * (same 24px box + 18px glyph as the GitHub icon next to it) showing the active
 * mode. Tapped, it scales open on the X axis from the button — on desktop
 * centred on it, so it grows both ways and sweeps over / "takes over" the
 * GitHub link (which fades out) — into a three-way switch (First Train / Auto /
 * Last Train). Clicking away, hitting Escape, or picking a mode collapses it and
 * brings GitHub back. Visible on mobile and desktop alike; replaces the old
 * split ThemeToggle (desktop pill + mobile-menu rows).
 */
export default function ThemeMenu({ className = "" }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setMounted(true), []);

  // Server + first client paint don't know the stored preference — render the
  // default ("system") until mounted so they agree.
  const active = mounted ? preference : "system";
  const activeIndex = Math.max(OPTIONS.findIndex((o) => o.value === active), 0);
  const ActiveIcon = ICONS[active];
  const activeLabel = OPTIONS[activeIndex].label;

  // Dismiss on outside pointer / Escape while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative flex items-center gap-3 sm:gap-4", className)}>
      {/* Trigger + its expanding panel. The panel is anchored to the trigger
          (its centre on desktop) and scales open on the X axis, so it grows out
          of the button itself — sweeping over the GitHub icon as it expands,
          rather than appearing to spawn from it. */}
      <div className="relative flex items-center">
        {/* Collapsed trigger — icon button on a soft raised chip (a translucent
            white fill reads as interactive without the recessed look a border/
            dark fill gives). Same 24px box + 18px glyph as the GitHub icon and
            the panel's options, so nothing resizes or shifts. Stays in layout
            (opacity only) so nothing reflows when the panel opens over it. */}
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`Theme: ${activeLabel}. Change theme`}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "press grid h-6 w-6 place-items-center rounded-full bg-white/15 text-white transition-colors duration-200 hover:bg-white/25 motion-reduce:transition-none",
            open && "pointer-events-none scale-75 opacity-0",
          )}
        >
          <ActiveIcon className="h-[18px] w-[18px]" />
        </button>

        {/* Expanded switch — scales open on the X axis from the trigger. On
            desktop it's centred on the button and grows to BOTH sides, sweeping
            over the GitHub icon; on mobile (no GitHub, hamburger to the right)
            it grows left from the button's edge so it can't collide. */}
        <div
          role="radiogroup"
          aria-label="Theme"
          aria-hidden={!open}
          className={cn(
            "absolute right-0 top-1/2 flex origin-right -translate-y-1/2 items-center gap-1 rounded-full border border-rtd-darkred bg-rtd-red/95 p-0.5 shadow-xl shadow-black/30 backdrop-blur-md transition-all duration-300 ease-out sm:left-1/2 sm:right-auto sm:origin-center sm:-translate-x-1/2 motion-reduce:transition-none",
            open
              ? "scale-x-100 opacity-100"
              : "pointer-events-none scale-x-0 opacity-0",
          )}
        >
          {/* Sliding highlight — 2rem cell + 0.25rem gap ⇒ 2.25rem step. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0.5 left-0.5 w-8 rounded-full bg-white transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(calc(${activeIndex} * 2.25rem))` }}
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
                tabIndex={open ? undefined : -1}
                onClick={() => {
                  setPreference(o.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={cn(
                  "relative z-10 grid h-8 w-8 place-items-center rounded-full transition-colors duration-200",
                  isActive ? "text-rtd-red" : "text-white/80 hover:text-white",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </button>
            );
          })}
        </div>
      </div>

      {/* GitHub — desktop only. `sm:grid place-items-center` (not `block`) kills
          the inline-SVG baseline gap so it centres on exactly the same line as
          the trigger. Fades out as the panel expands over it, returns on close. */}
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="View on Github"
        tabIndex={open ? -1 : undefined}
        aria-hidden={open}
        className={cn(
          "hidden h-6 w-6 place-items-center text-white/80 transition-all duration-300 ease-out hover:text-white sm:grid motion-reduce:transition-none",
          open && "pointer-events-none scale-75 opacity-0",
        )}
      >
        <GithubIcon className="h-6 w-6" />
      </a>
    </div>
  );
}
