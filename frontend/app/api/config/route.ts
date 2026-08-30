import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    cartoApiKey: process.env.CARTO_API_KEY ?? null,
  });
}
