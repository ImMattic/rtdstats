import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import NavBar from "@/components/ui/NavBar";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RTDstats - Denver RTD Tracking",
  description:
    "Real-time and historical tracking for Denver RTD — rail, bus, and Flatiron Flyer.",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
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
          <div className="flex min-h-screen flex-col">
            <NavBar />
            <main className="flex flex-1 flex-col">{children}</main>
            <footer className="border-t border-surface-border bg-surface-card py-2 text-center text-xs text-gray-500">
              Made with ❤️ in Broomfield, CO
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
