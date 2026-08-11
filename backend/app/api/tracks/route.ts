import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { parseBody, withErrorHandler, errorResponse, optionsResponse, corsHeaders, requireUser } from "@/lib/api";
import { supabaseAdmin, supabaseUser } from "@/lib/supabase";

const TrackSchema = z.object({
  title: z.string().min(1, "Название обязательно"),
  artist: z.string().optional(),
  artist_eff: z.string().min(1, "Нормализованный артист обязателен"),
  bpm: z.number().nullable().optional(),
  key: z.string().nullable().optional(),
  genres: z.array(z.string()).optional(),
  parts: z.array(z.string()).optional(),
  lang: z.enum(["RU", "Foreign"]).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  marks: z.array(z.string()).optional(),
  pool: z.string().optional(),
  preview: z.boolean().optional(),
  comment: z.string().nullable().optional(),
  local_path: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
});

const PATCH_LIMIT = ["comment", "local_path", "preview", "parts", "genres", "marks", "rating", "key", "bpm", "lang"];

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
    const { user } = await requireUser(req);
    const supabase = supabaseAdmin();

    const url = new URL(req.url);
    const pool = url.searchParams.get("pool");
    const artist = url.searchParams.get("artist");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
    const offset = Number(url.searchParams.get("offset")) || 0;

    let query = supabase.from("tracks").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (pool) query = query.eq("pool", pool);
    if (artist) query = query.ilike("artist_eff", `%${artist}%`);
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return respond({ tracks: data });
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const { user, token } = await requireUser(req);
    const body = await parseBody(req, TrackSchema);
    const supabase = supabaseUser(token);

    const { data, error } = await supabase
      .from("tracks")
      .upsert(
        { ...body, user_id: user.id, updated_at: new Date().toISOString() },
        { onConflict: "user_id,artist_eff,title", ignoreDuplicates: false },
      )
      .select()
      .single();
    if (error) {
      // upsert в Postgres через RLS: при конфликте может не обновляться — фолбэк на вставку/обновление
      if (error.message.includes("duplicate")) {
        const { data: existing } = await supabase
          .from("tracks")
          .select("*")
          .eq("user_id", user.id)
          .eq("artist_eff", body.artist_eff)
          .eq("title", body.title)
          .maybeSingle();
        if (existing) return respond(existing);
      }
      throw new Error(error.message);
    }
    return respond({ track: data }, 201);
  });
}
