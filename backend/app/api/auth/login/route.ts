import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { parseBody, withErrorHandler, errorResponse, optionsResponse, corsHeaders } from "@/lib/api";
import { supabaseAnon } from "@/lib/supabase";

const LoginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Пароль обязателен"),
});

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const { email, password } = await parseBody(req, LoginSchema);
    const { data, error } = await supabaseAnon().auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return errorResponse(401, error?.message === "Invalid login credentials" ? "Неверный email или пароль" : error?.message ?? "Ошибка входа");
    }
    const resp = NextResponse.json({ session: data.session, user: data.user });
    for (const [k, v] of Object.entries(corsHeaders())) resp.headers.set(k, v);
    return resp;
  });
}
