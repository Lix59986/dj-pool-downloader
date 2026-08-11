/** Клиент API бэкенда (dj-pool-downloader.vercel.app). */

import type { Favorite, Track } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface SessionResp {
  session: { access_token: string };
  user: { id: string; email: string };
}

async function request<T>(
  backendUrl: string,
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.headers) Object.assign(headers, init.headers);
  const res = await fetch(backendUrl + path, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Ошибка ${res.status}`);
  return data as T;
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function apiLogin(backendUrl: string, email: string, password: string): Promise<SessionResp> {
  return request<SessionResp>(backendUrl, "/api/auth/login", { method: "POST", body: { email, password } });
}

export async function apiRegister(
  backendUrl: string,
  email: string,
  password: string,
  invite_code: string,
): Promise<SessionResp> {
  return request<SessionResp>(backendUrl, "/api/auth/register", {
    method: "POST",
    body: { email, password, invite_code },
  });
}

export interface ServerFavorite {
  id: string;
  pool: string;
  track_id_on_pool: string | null;
  title: string;
  artist: string | null;
  url: string | null;
  meta: Favorite["meta"];
  status: Favorite["status"];
  local_path: string | null;
  added_at: string;
}

export async function apiGetFavorites(backendUrl: string, token: string): Promise<ServerFavorite[]> {
  const data = await request<{ favorites: ServerFavorite[] }>(backendUrl, "/api/favorites", {
    headers: authHeaders(token),
  });
  return data.favorites;
}

export async function apiAddFavorite(
  backendUrl: string,
  token: string,
  fav: Omit<ServerFavorite, "id" | "added_at">,
): Promise<ServerFavorite> {
  const data = await request<{ favorite: ServerFavorite }>(backendUrl, "/api/favorites", {
    method: "POST",
    headers: authHeaders(token),
    body: fav,
  });
  return data.favorite;
}

export async function apiDeleteFavorite(backendUrl: string, token: string, id: string): Promise<void> {
  await request(backendUrl, `/api/favorites?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export interface ServerTrack {
  id: string;
  title: string;
  artist: string | null;
  artist_eff: string;
  bpm: number | null;
  key: string | null;
  genres: string[];
  parts: string[];
  lang: "RU" | "Foreign";
  rating: number | null;
  marks: string[];
  pool: string | null;
  preview: boolean;
  comment: string | null;
  local_path: string | null;
  source_url: string | null;
}

export async function apiGetTracks(backendUrl: string, token: string): Promise<ServerTrack[]> {
  const data = await request<{ tracks: ServerTrack[] }>(backendUrl, "/api/tracks", { headers: authHeaders(token) });
  return data.tracks;
}

export async function apiAddTrack(
  backendUrl: string,
  token: string,
  track: Pick<Track, "title" | "artist" | "artist_eff" | "bpm" | "key" | "genres" | "parts" | "lang" | "rating" | "marks" | "pool" | "preview" | "comment">,
): Promise<ServerTrack> {
  const data = await request<{ track: ServerTrack }>(backendUrl, "/api/tracks", {
    method: "POST",
    headers: authHeaders(token),
    body: {
      title: track.title,
      artist: track.artist ?? undefined,
      artist_eff: track.artist_eff,
      bpm: track.bpm,
      key: track.key,
      genres: track.genres,
      parts: track.parts,
      lang: track.lang,
      rating: track.rating,
      marks: track.marks,
      pool: track.pool,
      preview: track.preview,
      comment: track.comment,
    },
  });
  return data.track;
}
