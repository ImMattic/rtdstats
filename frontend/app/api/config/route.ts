import { NextResponse } from "next/server";

// Without this, the route has no request-specific APIs (no headers/cookies/
// searchParams), so Next.js statically renders it once at `next build` time
// and caches that output. CARTO_API_KEY is only injected at container runtime
// (via docker-compose `environment:`), not at build time, so the static
// response would permanently bake in `cartoApiKey: null`.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    cartoApiKey: process.env.CARTO_API_KEY ?? null,
  });
}
