import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { parseBody, withErrorHandler, errorResponse, optionsResponse, corsHeaders, requireUser } from "@/lib/api";
import { supabaseUser } from "@/lib/supabase";

const SettingsSchema = z.object({
  download_folder: z.string().nullable().optional(),
  layout: z.enum(["night", "artist", "genre", "flat"]).optional(),
  template: z.string().nullable().optional(),
});

export async function OPTIONS() {
  return optionsResponse();
}

function respond(data: unknown, status = 200) {
  const resp = NextResponse.json(data, { status });
  for (const [k, v] of Object.entries(corsHeaders())) resp.headers.set(k, v);
  return resp;
}

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const { user, token } = await requireUser(req);
    const supabase = supabaseUser(token);
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return respond({ settings: data ?? null });
  });
}

export async function PATCH(req: NextRequest) {
  return withErrorHandler(async () => {
    const { user, token } = await requireUser(req);
    const body = await parseBody(req, SettingsSchema);
    const supabase = supabaseUser(token);

    const { data, error } = await supabase
      .from("settings")
      .upsert(
        { ...body, user_id: user.id, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return respond({ settings: data });
  });
}
