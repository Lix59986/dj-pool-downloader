import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { parseBody, withErrorHandler, errorResponse, optionsResponse, corsHeaders, requireUser } from "@/lib/api";
import { supabaseUser } from "@/lib/supabase";

const PatchSchema = z.object({
  status: z.enum(["new", "done", "preview", "error"]).optional(),
  local_path: z.string().nullable().optional(),
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
      .from("favorites")
      .update(body)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (!data) return errorResponse(404, "Избранное не найдено");
    return respond({ favorite: data });
  });
}
