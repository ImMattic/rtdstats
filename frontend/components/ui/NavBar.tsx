"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import ThemeToggle from "./ThemeToggle";

const NAV_LINKS = [
  { href: "/", label: "Live Map" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trips", label: "Trips" },
];

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="7" fill="#0A4FBE" />
      <path d="M5 12h14" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <circle cx="8" cy="12" r="2.4" fill="#ffffff" />
      <circle cx="16" cy="12" r="2.4" fill="#FDBA2F" />
    </svg>
  );
}

function NavLink({
  href,
  label,
  active,
  onClick,
  block = false,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick?: () => void;
  block?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "press rounded-lg text-sm font-medium transition-colors",
        block ? "px-3 py-2" : "px-3 py-1.5",
        active
          ? "bg-accent/10 text-accent"
          : "text-fg-muted hover:bg-card-muted hover:text-fg",
      )}
    >
      {label}
    </Link>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-card/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-2.5">
        <Link href="/" className="press flex items-center gap-2">
          <BrandMark />
          <span className="font-display text-lg font-extrabold tracking-tight text-fg">
            RTD<span className="text-rtd-gold">stats</span>
          </span>
        </Link>

        <nav className="hidden gap-1 sm:flex">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.href} {...link} active={isActive(link.href)} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <a
            href="https://github.com/ImMattic/rtdstats"
            target="_blank"
            rel="noopener noreferrer"
            title="View on GitHub"
            aria-label="View source on GitHub"
            className="press grid h-9 w-9 place-items-center rounded-full border border-line text-fg-muted hover:border-fg-subtle hover:text-fg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="press grid h-9 w-9 place-items-center rounded-full border border-line text-fg-muted hover:text-fg sm:hidden"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="animate-fade-in flex flex-col gap-1 border-t border-line px-4 pb-3 pt-2 sm:hidden">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.href}
              {...link}
              active={isActive(link.href)}
              block
              onClick={() => setMenuOpen(false)}
            />
          ))}
        </nav>
      )}
    </header>
  );
}
