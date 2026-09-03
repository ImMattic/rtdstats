interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  accent?: "green" | "orange" | "red" | "blue" | "default";
}

const accentClasses = {
  green: "text-ok",
  orange: "text-warn",
  red: "text-danger",
  blue: "text-accent",
  default: "text-fg",
};

export default function StatsCard({ title, value, subtitle, accent = "default" }: Props) {
  return (
    <div className="rounded-xl border border-line bg-card p-5 shadow-card">
      <p className="text-sm text-fg-subtle font-medium">{title}</p>
      <p className={`mt-1 text-3xl font-bold ${accentClasses[accent]}`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-fg-subtle">{subtitle}</p>}
    </div>
  );
}
