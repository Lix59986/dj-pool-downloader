import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { parseBody, withErrorHandler, errorResponse, optionsResponse, corsHeaders, requireUser } from "@/lib/api";
import { supabaseUser } from "@/lib/supabase";

const FavoriteSchema = z.object({
  pool: z.string().min(1, "pool обязателен"),
  track_id_on_pool: z.string().optional(),
  title: z.string().min(1, "Название обязательно"),
  artist: z.string().optional(),
  url: z.string().optional(),
  meta: z
    .object({
      bpm: z.number().nullable().optional(),
      key: z.string().nullable().optional(),
      genres: z.array(z.string()).optional(),
      parts: z.array(z.string()).optional(),
      rating: z.number().int().min(1).max(5).nullable().optional(),
      marks: z.array(z.string()).optional(),
    })
    .optional(),
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
    const url = new URL(req.url);
    const pool = url.searchParams.get("pool");
    const status = url.searchParams.get("status");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);
    const offset = Number(url.searchParams.get("offset")) || 0;

    let query = supabase.from("favorites").select("*").eq("user_id", user.id).order("added_at", { ascending: false });
    if (pool) query = query.eq("pool", pool);
    if (status) query = query.eq("status", status);
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return respond({ favorites: data });
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const { user, token } = await requireUser(req);
    const body = await parseBody(req, FavoriteSchema);
    const supabase = supabaseUser(token);

    const { data, error } = await supabase
      .from("favorites")
      .upsert(
        { ...body, user_id: user.id },
        { onConflict: "user_id,pool,track_id_on_pool", ignoreDuplicates: false },
      )
      .select()
      .single();
    if (error) {
      if (error.message.includes("duplicate") && body.track_id_on_pool) {
        const { data: existing } = await supabase
          .from("favorites")
          .select("*")
          .eq("user_id", user.id)
          .eq("pool", body.pool)
          .eq("track_id_on_pool", body.track_id_on_pool)
          .maybeSingle();
        if (existing) return respond(existing);
      }
      throw new Error(error.message);
    }
    return respond({ favorite: data }, 201);
  });
}

export async function DELETE(req: NextRequest) {
  return withErrorHandler(async () => {
    const { user, token } = await requireUser(req);
    const supabase = supabaseUser(token);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const pool = url.searchParams.get("pool");
    const track_id_on_pool = url.searchParams.get("track_id_on_pool");

    if (!id && !(pool && track_id_on_pool)) {
      return errorResponse(400, "Укажите ?id= или ?pool=&track_id_on_pool=");
    }
    let query = supabase.from("favorites").delete().eq("user_id", user.id);
    if (id) query = query.eq("id", id);
    else query = query.eq("pool", pool!).eq("track_id_on_pool", track_id_on_pool!);
    const { data, error } = await query.select("id");
    if (error) throw new Error(error.message);
    return respond({ deleted: data?.length ?? 0 });
  });
}
