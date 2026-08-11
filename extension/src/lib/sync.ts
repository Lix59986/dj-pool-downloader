/** Синхронизация с бэкендом: пушим локальные изменения и тянем серверные. */

import { DB } from "./db";
import { apiAddFavorite, apiAddTrack, apiGetFavorites, apiGetTracks } from "./api";
import type { Favorite, Settings, Track } from "./types";

export interface SyncResult {
  pushedFavorites: number;
  pulledFavorites: number;
  pushedTracks: number;
  pulledTracks: number;
}

/** Пушить локальные unsynced избранные на сервер. */
async function pushFavorites(settings: Settings, token: string): Promise<number> {
  const unsynced = await DB.unsyncedFavorites();
  let pushed = 0;
  for (const fav of unsynced) {
    try {
      await apiAddFavorite(settings.backendUrl, token, {
        pool: fav.pool,
        track_id_on_pool: fav.track_id_on_pool,
        title: fav.title,
        artist: fav.artist,
        url: fav.url,
        meta: fav.meta,
        status: fav.status,
        local_path: fav.local_path,
      });
      await DB.addFavorite({ ...fav, synced: true });
      pushed++;
    } catch {
      // останавливаемся на первой ошибке сети, остальное в следующий раз
      break;
    }
  }
  return pushed;
}

/** Тянуть серверные избранные в локальную базу (без удаления локальных). */
async function pullFavorites(settings: Settings, token: string): Promise<number> {
  const remote = await apiGetFavorites(settings.backendUrl, token);
  let pulled = 0;
  for (const r of remote) {
    const id = r.id;
    const existing = (await DB.allFavorites()).find((f) => f.id === id);
    if (existing) {
      if (!existing.synced) {
        await DB.addFavorite({ ...existing, synced: true });
        pulled++;
      }
      continue;
    }
    await DB.addFavorite({
      id,
      pool: r.pool,
      track_id_on_pool: r.track_id_on_pool,
      title: r.title,
      artist: r.artist,
      url: r.url,
      meta: r.meta,
      status: r.status,
      local_path: r.local_path,
      added_at: r.added_at,
      synced: true,
    });
    pulled++;
  }
  return pulled;
}

/** Пушить треки (скачанные) на сервер. */
async function pushTracks(settings: Settings, token: string): Promise<number> {
  const unsynced = await DB.unsyncedTracks();
  let pushed = 0;
  for (const t of unsynced) {
    try {
      await apiAddTrack(settings.backendUrl, token, t);
      await DB.updateTrack(t.id, { synced: true });
      pushed++;
    } catch {
      break;
    }
  }
  return pushed;
}

/** Тянуть серверные треки (например, с телефона) локально. */
async function pullTracks(settings: Settings, token: string): Promise<number> {
  const remote = await apiGetTracks(settings.backendUrl, token);
  let pulled = 0;
  for (const r of remote) {
    const id = r.id;
    const existing = (await DB.allTracks()).find((t) => t.id === id);
    if (existing) continue;
    await DB.addTrack({
      id,
      title: r.title,
      artist: r.artist,
      artist_eff: r.artist_eff,
      bpm: r.bpm,
      key: r.key,
      genres: r.genres ?? [],
      parts: (r.parts ?? []) as Track["parts"],
      lang: r.lang,
      rating: r.rating,
      marks: r.marks ?? [],
      pool: r.pool ?? "unknown",
      pool_type: null,
      preview: r.preview,
      comment: r.comment,
      file_path: r.local_path,
      file_ext: r.local_path?.split(".").pop()?.toLowerCase() ?? null,
      file_size: null,
      duration_sec: null,
      bitrate: null,
      sample_rate: null,
      url: r.source_url,
      downloaded_at: null,
      updated_at: new Date().toISOString(),
      synced: true,
    });
    pulled++;
  }
  return pulled;
}

export async function syncAll(settings: Settings): Promise<SyncResult> {
  if (!settings.token) throw new Error("Не авторизован");
  const [pushedFavorites, pulledFavorites, pushedTracks, pulledTracks] = await Promise.all([
    pushFavorites(settings, settings.token),
    pullFavorites(settings, settings.token),
    pushTracks(settings, settings.token),
    pullTracks(settings, settings.token),
  ]);
  return { pushedFavorites, pulledFavorites, pushedTracks, pulledTracks };
}
