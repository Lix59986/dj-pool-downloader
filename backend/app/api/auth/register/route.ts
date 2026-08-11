import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { parseBody, withErrorHandler, errorResponse, optionsResponse, corsHeaders } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";

const RegisterSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов"),
  invite_code: z.string().min(1, "Инвайт-код обязателен"),
});

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const { email, password, invite_code } = await parseBody(req, RegisterSchema);
    const admin = supabaseAdmin();

    // 1. Проверяем инвайт-код
    const { data: invite, error: inviteErr } = await admin
      .from("invites")
      .select("*")
      .eq("code", invite_code)
      .maybeSingle();
    if (inviteErr) throw new Error(inviteErr.message);
    if (!invite) throw new Error("невалидный код");
    if (invite.used_at || invite.used_by) return errorResponse(403, "Инвайт-код уже использован");
    if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
      return errorResponse(403, "Инвайт-код выдан на другой email");
    }

    // 2. Создаём пользователя
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      if (createErr.status === 409) return errorResponse(409, "Пользователь с таким email уже существует");
      throw new Error(createErr.message);
    }
    const userId = created.user!.id;

    // 3. Помечаем код использованным
    const { error: useErr } = await admin
      .from("invites")
      .update({ used_by: userId, used_at: new Date().toISOString() })
      .eq("code", invite_code);
    if (useErr) throw new Error(useErr.message);

    // 4. Немедленный вход (сессия для расширения/PWA)
    const { data: signIn, error: signInErr } = await admin.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) throw new Error(signInErr.message);

    const resp = NextResponse.json(
      {
        session: signIn.session,
        user: {
          id: userId,
          email,
          role: "user",
        },
      },
      { status: 201 },
    );
    for (const [k, v] of Object.entries(corsHeaders())) resp.headers.set(k, v);
    return resp;
  });
}
