"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Live Map" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/historical", label: "Historical" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="bg-rtd-red text-white shadow-lg border-b-2 border-rtd-darkred">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-8">
        <span className="text-xl font-bold tracking-tight">
          RTD<span className="text-rtd-gold">stats</span>
        </span>
        <nav className="flex gap-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium px-3 py-1.5 rounded transition-colors",
                pathname === link.href
                  ? "bg-rtd-darkred text-white"
                  : "text-white/80 hover:text-white hover:bg-rtd-darkred/60",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
