import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Optional built-in header. */
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

/** The shared panel used across the dashboard and trips pages. */
export function Card({ children, className, title, subtitle, actions }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-card p-5 shadow-card",
        className,
      )}
    >
      {(title || actions) && (
        <SectionHeading title={title ?? ""} subtitle={subtitle} right={actions} />
      )}
      {children}
    </div>
  );
}

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

/** Section header with optional subtitle and right-aligned controls. */
export function SectionHeading({ title, subtitle, right }: SectionHeadingProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-base font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Wrap content in a one-shot fade-up entrance (respects reduced motion). */
export function Reveal({
  children,
  delayMs = 0,
  className,
}: {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("animate-fade-up", className)}
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
