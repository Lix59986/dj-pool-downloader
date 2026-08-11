import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { parseBody, withErrorHandler, errorResponse, optionsResponse, corsHeaders } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/api";

const CreateInvitesSchema = z.object({
  count: z.number().int().min(1).max(100).default(1),
  email: z.string().email("Некорректный email").optional(),
});

function makeCode(len = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const rand = new Uint8Array(len);
  crypto.getRandomValues(rand);
  for (let i = 0; i < len; i++) out += chars[rand[i] % chars.length];
  return out;
}

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    await requireAdmin(req);
    const admin = supabaseAdmin();
    const { data, error } = await admin.from("invites").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const resp = NextResponse.json({ invites: data });
    for (const [k, v] of Object.entries(corsHeaders())) resp.headers.set(k, v);
    return resp;
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const adminUser = await requireAdmin(req);
    const { count, email } = await parseBody(req, CreateInvitesSchema);
    const admin = supabaseAdmin();

    const rows = Array.from({ length: count }, () => ({
      code: makeCode(),
      email: email ?? null,
      created_by: adminUser.user.id,
    }));

    const { data, error } = await admin.from("invites").insert(rows).select("code, email, created_at");
    if (error) throw new Error(error.message);
    const resp = NextResponse.json({ invites: data }, { status: 201 });
    for (const [k, v] of Object.entries(corsHeaders())) resp.headers.set(k, v);
    return resp;
  });
}
