/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Server-side proxy: forwards /api/* from the Next.js server to the backend.
  // BACKEND_URL is a server-only env var (no NEXT_PUBLIC_ prefix), so the browser
  // never sees it. Inside Docker Compose the value is http://backend:8000.
  // For local dev outside Docker it falls back to http://localhost:8000.
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
