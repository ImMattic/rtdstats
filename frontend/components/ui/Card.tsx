import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/** The shared white panel used across the dashboard and historical pages. */
export function Card({ children, className }: CardProps) {
  return (
    <div className={cn("rounded-xl border border-gray-200 bg-white p-5 shadow-sm", className)}>
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
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
