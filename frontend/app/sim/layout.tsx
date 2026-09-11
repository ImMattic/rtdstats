import type { Metadata } from "next";

// Unlisted on purpose: nothing links here, and crawlers are told to leave it
// alone. The real gate is the password on the backend — this only keeps the
// page out of search results.
export const metadata: Metadata = {
  title: "Game Simulator",
  robots: { index: false, follow: false, nocache: true },
};

export default function SimLayout({ children }: { children: React.ReactNode }) {
  return children;
}
