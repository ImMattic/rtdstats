interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  accent?: "green" | "orange" | "red" | "blue" | "default";
}

const accentClasses = {
  green: "text-green-600 dark:text-emerald-400",
  orange: "text-orange-500 dark:text-orange-400",
  red: "text-red-600 dark:text-red-400",
  blue: "text-rtd-blue dark:text-accent",
  default: "text-gray-900 dark:text-fg",
};

export default function StatsCard({ title, value, subtitle, accent = "default" }: Props) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <p className="text-sm font-medium text-fg-muted">{title}</p>
      <p className={`mt-1 font-display text-3xl font-bold ${accentClasses[accent]}`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-fg-subtle">{subtitle}</p>}
    </div>
  );
}
