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
          </div>
        </Providers>
      </body>
    </html>
  );
}
