export default function LoadingSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-fg-subtle">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
