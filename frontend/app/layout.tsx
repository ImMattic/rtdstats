import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import NavBar from "@/components/ui/NavBar";
import SiteFooter from "@/components/ui/SiteFooter";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"] });

const description =
  "Real-time vehicle positions, on-time performance, and delay tracking for Denver's RTD light rail, commuter rail, and bus network.";

// Runs before hydration so the theme is painted before first paint (no flash).
// Mirrors lib/useTheme.ts's resolve logic: an explicit "dark"/"light" wins,
// "system" (or nothing stored yet) follows the OS setting.
const THEME_INIT = `(function(){try{var p=localStorage.getItem('rtdstats-theme');var t=(p==='dark'||p==='light')?p:((window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark');document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

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
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-canvas text-fg antialiased`}>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT }}
        />
        <Providers>
          <div className="flex min-h-dvh flex-col">
            <NavBar />
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
