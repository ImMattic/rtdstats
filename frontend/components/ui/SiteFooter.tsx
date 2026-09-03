"use client";
import { usePathname } from "next/navigation";

export default function SiteFooter() {
  const pathname = usePathname();

  // The live map is a full-viewport screen; the footer eats real estate there.
  if (pathname === "/") return null;

  return (
    <footer className="border-t border-line bg-card py-2 text-center text-xs text-fg-subtle">
      Made with ❤️ in Broomfield, CO
    </footer>
  );
}
