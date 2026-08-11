import { NextResponse } from "next/server";
import { withErrorHandler, optionsResponse, corsHeaders } from "@/lib/api";
import { POOLS, TEMPLATE_POOLS } from "@/lib/pools";

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  return withErrorHandler(async () => {
    const resp = NextResponse.json({ pools: POOLS, templates: TEMPLATE_POOLS });
    for (const [k, v] of Object.entries(corsHeaders())) resp.headers.set(k, v);
    return resp;
  });
}
