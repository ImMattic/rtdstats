import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import NavBar from "@/components/ui/NavBar";
import SiteFooter from "@/components/ui/SiteFooter";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="en">
      <body className={`${inter.className} bg-surface text-gray-100 antialiased`}>
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
