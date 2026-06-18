interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  accent?: "green" | "orange" | "red" | "blue" | "default";
}

const accentClasses = {
  green: "text-green-600",
  orange: "text-orange-500",
  red: "text-red-600",
  blue: "text-rtd-blue",
  default: "text-gray-900",
};

export default function StatsCard({ title, value, subtitle, accent = "default" }: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500 font-medium">{title}</p>
      <p className={`mt-1 text-3xl font-bold ${accentClasses[accent]}`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}
