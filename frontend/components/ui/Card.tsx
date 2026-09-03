import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/** The shared panel used across the dashboard and trips pages. */
export function Card({ children, className }: CardProps) {
  return (
    <div className={cn("rounded-xl border border-line bg-card p-5 shadow-card", className)}>
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
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-fg-subtle">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
