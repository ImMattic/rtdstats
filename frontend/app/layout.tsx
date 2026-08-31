import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import NavBar from "@/components/ui/NavBar";
import BootSplash from "@/components/ui/BootSplash";
import Providers from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

// Runs before hydration so the theme is set before first paint (no flash).
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

const description =
  "Real-time vehicle positions, on-time performance, and delay tracking for Denver's RTD light rail, commuter rail, and bus network.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://rtdstats-staging.configmode.com"
  ),
  title: "RTDstats – Denver RTD Live Tracker",
  description,
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "RTDstats – Denver RTD Live Tracker",
    description,
    type: "website",
    locale: "en_US",
    siteName: "RTDstats",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RTDstats – Denver RTD Live Tracker",
    description,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${interTight.variable}`}
    >
      <body className="bg-canvas font-sans text-fg antialiased">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT }}
        />
        <noscript>
          {/* Don't trap no-JS visitors behind the client-only splash. */}
          <style dangerouslySetInnerHTML={{ __html: "#boot-splash{display:none!important}" }} />
        </noscript>
        <Providers>
          <BootSplash />
          <div className="flex min-h-screen flex-col">
            <NavBar />
            <main className="flex flex-1 flex-col">{children}</main>
            <footer className="border-t border-line bg-card py-3 text-center text-xs text-fg-subtle">
              Made with <span className="text-accent-red">❤</span> in Broomfield, CO
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
