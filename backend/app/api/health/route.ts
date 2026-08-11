import { NextResponse } from "next/server";
import { withErrorHandler, corsHeaders } from "@/lib/api";

export async function GET() {
  return withErrorHandler(async () => {
    const resp = NextResponse.json({
      ok: true,
      service: "dj-pool-downloader",
      version: "0.1.0",
      time: new Date().toISOString(),
    });
    for (const [k, v] of Object.entries(corsHeaders())) resp.headers.set(k, v);
    return resp;
  });
}
