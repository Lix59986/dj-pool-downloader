import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { parseBody, withErrorHandler, errorResponse, optionsResponse, corsHeaders, requireUser } from "@/lib/api";
import { supabaseUser } from "@/lib/supabase";

const PatchSchema = z.object({
  comment: z.string().nullable().optional(),
  local_path: z.string().nullable().optional(),
  preview: z.boolean().optional(),
  parts: z.array(z.string()).optional(),
  genres: z.array(z.string()).optional(),
  marks: z.array(z.string()).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  key: z.string().nullable().optional(),
  bpm: z.number().nullable().optional(),
  lang: z.enum(["RU", "Foreign"]).optional(),
});

export async function OPTIONS() {
  return optionsResponse();
}

function respond(data: unknown, status = 200) {
  const resp = NextResponse.json(data, { status });
  for (const [k, v] of Object.entries(corsHeaders())) resp.headers.set(k, v);
  return resp;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const { id } = await params;
    const { user, token } = await requireUser(req);
    const body = await parseBody(req, PatchSchema);
    const supabase = supabaseUser(token);

    const { data, error } = await supabase
      .from("tracks")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (!data) return errorResponse(404, "Трек не найден");
    return respond({ track: data });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const { id } = await params;
    const { user, token } = await requireUser(req);
    const supabase = supabaseUser(token);

    const { data, error } = await supabase
      .from("tracks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return errorResponse(404, "Трек не найден");
    return respond({ deleted: true });
  });
}
