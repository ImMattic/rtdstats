import { cn } from "@/lib/utils";
import InfoTip from "./InfoTip";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/** The shared panel used across the dashboard and trips pages. */
export function Card({ children, className }: CardProps) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-line bg-card p-5 shadow-card", className)}>
      {children}
    </div>
  );
}

interface SectionHeadingProps {
  title: string;
  /** Shown under the title at all times — reserve this for actual data (a live
   *  figure, a computed span), not "how to use this" copy. */
  subtitle?: string;
  /** "How to read this" explanation tucked behind a hover/tap "?" next to the
   *  title, instead of permanent text competing with `right` for room. */
  hint?: React.ReactNode;
  right?: React.ReactNode;
}

/** Section header with an optional subtitle, "?" hint, and right-aligned controls. */
export function SectionHeading({ title, subtitle, hint, right }: SectionHeadingProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-fg">
          {title}
          {hint && <InfoTip>{hint}</InfoTip>}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-fg-subtle">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
