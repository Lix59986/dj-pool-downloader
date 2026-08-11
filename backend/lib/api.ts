import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { supabaseAdmin, supabaseUser } from "./supabase";
import type { NextRequest } from "next/server";

/** Разбор тела запроса через zod: при ошибке — 400 с понятным сообщением. */
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Тело запроса должно быть валидным JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error instanceof ZodError ? result.error.issues[0] : undefined;
    throw new ApiError(400, first ? `${first.path.join(".") || "body"}: ${first.message}` : "Некорректные данные");
  }
  return result.data;
}

/** Ошибка API с HTTP-кодом. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Единый формат ответа об ошибке. */
export function errorResponse(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Получить токен пользователя из заголовка Authorization. */
export function authToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [type, token] = header.split(" ");
  return type?.toLowerCase() === "bearer" && token ? token : null;
}

/** Авторизованный пользователь (auth.getUser по токену) — иначе 401. */
export async function requireUser(req: NextRequest) {
  const token = authToken(req);
  if (!token) throw new ApiError(401, "Требуется авторизация (Authorization: Bearer <jwt>)");
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "Сессия недействительна или истекла");
  return { user: data.user, token };
}

/** Проверка, что пользователь — админ (по профилю). */
export async function requireAdmin(req: NextRequest) {
  const { user } = await requireUser(req);
  const { data: profile } = await supabaseAdmin()
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new ApiError(403, "Требуются права администратора");
  return { user, token: authToken(req) as string };
}

/** Обёртка роута: перехватывает ApiError и прочие ошибки. */
export function withErrorHandler<T>(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  return handler().catch((e: unknown) => {
    if (e instanceof ApiError) return errorResponse(e.status, e.message);
    console.error("Unhandled API error:", e);
    return errorResponse(500, "Внутренняя ошибка сервера");
  });
}

/** CORS-заголовки: домен PWA + расширения Chrome. */
export function corsHeaders(): Record<string, string> {
  const origin = process.env.CORS_ORIGIN ?? "";
  const allowed = [
    "chrome-extension://",
    ...(origin ? [origin] : []),
  ];
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

/** Ответ на OPTIONS (preflight). */
export function optionsResponse(): NextResponse {
  const resp = new NextResponse(null, { status: 204 });
  for (const [k, v] of Object.entries(corsHeaders())) resp.headers.set(k, v);
  return resp;
}
