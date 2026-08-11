/** Коннекторы пулов: домены, поисковые URL, маппинг ответов API (фикстуры) → RawTrack. */

import type { Favorite, Track } from "./types";
import { normalizeArtist, stripVersionSuffixes } from "./normalize";
import { detectLang, mapGenres, partsFromLabels, keyToCamelot, buildComment, poolPrefix } from "./classify";

export interface RawTrack {
  pool: string;
  track_id_on_pool: string;
  title: string;
  artist: string | null;
  artist_eff: string;
  bpm: number | null;
  key: string | null; // Camelot (jesteipool/muzvizor) или музыкальная нотация (36pool) → ключ для Rekordbox
  genres: string[]; // наши группы
  parts: string[]; // raw-метки (Opening, Pre-Party...) до маппинга
  rating: number | null;
  marks: string[];
  pool_type: string | null; // Original/Remix/Intro/Extended
  preview: boolean;
  duration_sec: number | null;
  url: string | null; // страница трека или прямой URL
}

export interface PoolConnector {
  id: string;
  name: string;
  domains: string[];
  searchUrl(query: string): string;
  /** Парсинг ответа API → массив RawTrack. */
  parseResponse(json: unknown): RawTrack[];
  /** Прямой URL файла из RawTrack (null если нет прямого URL). */
  fileUrl(raw: RawTrack): string | null;
  toFavorite(raw: RawTrack): Omit<Favorite, "id" | "added_at" | "synced">;
  toTrack(
    raw: RawTrack,
  ): Omit<Track, "id" | "file_path" | "file_size" | "file_ext" | "downloaded_at" | "updated_at" | "synced">;
}

/* ---------- общие хелперы ---------- */

/** Части ночи: строка может содержать несколько меток через пробел ("Opening Primetime"). */
function partsFrom(raw: string[] | string | null | undefined): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/\s+/);
  return list.map((s) => String(s).trim()).filter(Boolean);
}

/** Маркировки: объект {title, code} или массив таких объектов (jesteipool marking/event_marking). */
function marksFrom(raw: unknown): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((m) => {
      if (typeof m === "string") return m;
      if (m && typeof m === "object" && "title" in m) return String((m as { title?: unknown }).title ?? "");
      return "";
    })
    .filter(Boolean);
}

function genresFrom(list: { title?: string; name?: string }[] | { name: string } | string | null | undefined): string[] {
  if (Array.isArray(list)) return list.map((g) => (g as { title?: string; name?: string }).title ?? (g as { name: string }).name ?? "").filter(Boolean);
  if (list && typeof list === "object" && "name" in list) return [(list as { name: string }).name ?? ""].filter(Boolean);
  if (typeof list === "string") return [list];
  return [];
}

function baseTrack(
  raw: RawTrack,
): Omit<Track, "id" | "file_path" | "file_size" | "file_ext" | "downloaded_at" | "updated_at" | "synced"> {
  const parts = partsFromLabels(raw.parts);
  const comment = buildComment(
    { parts, genres: raw.genres, marks: raw.marks, pool_type: raw.pool_type },
    poolPrefix(raw.pool),
  );
  return {
    title: raw.title,
    artist: raw.artist,
    artist_eff: raw.artist_eff,
    bpm: raw.bpm,
    key: raw.key,
    genres: raw.genres,
    parts,
    lang: detectLang(raw.title, raw.artist),
    rating: raw.rating,
    marks: raw.marks,
    pool: raw.pool,
    pool_type: raw.pool_type,
    preview: raw.preview,
    comment: comment || null,
    duration_sec: raw.duration_sec,
    bitrate: null,
    sample_rate: null,
    url: raw.url,
  };
}

function toFavorite(raw: RawTrack): Omit<Favorite, "id" | "added_at" | "synced"> {
  const parts = partsFromLabels(raw.parts);
  const comment = buildComment(
    { parts, genres: raw.genres, marks: raw.marks, pool_type: raw.pool_type },
    poolPrefix(raw.pool),
  );
  return {
    pool: raw.pool,
    track_id_on_pool: raw.track_id_on_pool,
    title: raw.title,
    artist: raw.artist,
    url: raw.url,
    meta: {
      bpm: raw.bpm,
      key: raw.key,
      genres: raw.genres,
      parts,
      rating: raw.rating,
      marks: raw.marks,
      comment: comment || null,
    },
    status: "new",
    local_path: null,
  };
}

/* ---------- jesteipool ---------- */

type JesteiRaw = {
  id: string;
  name?: string;
  artist?: string;
  bpm?: number | null;
  key?: string | null;
  genres?: { title?: string; code?: string; sort?: number }[];
  part_night?: string[] | string;
  rating?: number | null;
  marking?: unknown;
  event_marking?: unknown;
  type?: string | null;
  variant?: string | null;
  preview_length?: number;
  duration?: number | null;
  source?: string | null;
};

const jesteipool: PoolConnector = {
  id: "jesteipool",
  name: "Jestei Pool",
  domains: ["jesteipool.ru", "rest.jesteipool.ru"],
  searchUrl(query) {
    return `https://rest.jesteipool.ru/api/search/tracks?q=${encodeURIComponent(query)}&variant=all&limit=20`;
  },
  parseResponse(json) {
    if (!Array.isArray(json)) return [];
    return json.map((t) => {
      const raw = t as JesteiRaw;
      const artist = raw.artist ?? null;
      const title = raw.name ?? "";
      const poolType = raw.variant || raw.type || null;
      const preview = !!(raw.preview_length && raw.preview_length < 180 && !raw.source);
      return {
        pool: "jesteipool",
        track_id_on_pool: raw.id,
        title,
        artist,
        artist_eff: normalizeArtist(artist) || "Неизвестный",
        bpm: raw.bpm ?? null,
        key: raw.key ?? null,
        genres: mapGenres(genresFrom(raw.genres)),
        parts: partsFrom(raw.part_night),
        rating: raw.rating ?? null,
        marks: [...marksFrom(raw.marking), ...marksFrom(raw.event_marking)],
        pool_type: poolType,
        preview,
        duration_sec: raw.duration ? Math.round(raw.duration) : null,
        url: raw.source ?? null,
      } satisfies RawTrack;
    });
  },
  fileUrl(raw) {
    return raw.url;
  },
  toFavorite,
  toTrack: baseTrack,
};

/* ---------- muzvizor ---------- */

type MuzvizorRaw = {
  id: string;
  title?: string;
  artist?: string;
  bpm?: number | null;
  key?: string | null;
  stage?: string | null;
  genre?: { name?: string } | null;
  genres?: { name?: string }[];
  audios?: { version?: { name?: string }; download?: boolean; length_real?: number | null; length?: number | null }[];
  date_published?: string | null;
};

const muzvizor: PoolConnector = {
  id: "muzvizor",
  name: "MuzVizor",
  domains: ["muzvizor.com"],
  searchUrl(query) {
    return `https://muzvizor.com/api/v1/tracks/?query=${encodeURIComponent(query)}`;
  },
  parseResponse(json) {
    const tracks = (json as { tracks?: unknown[] } | null)?.tracks;
    if (!Array.isArray(tracks)) return [];
    return tracks.map((t) => {
      const raw = t as MuzvizorRaw;
      const artist = raw.artist ?? null;
      const audio = raw.audios?.[0];
      const isPreview = audio ? !audio.download || (audio.length_real ?? 0) < 180 : false;
      return {
        pool: "muzvizor",
        track_id_on_pool: raw.id,
        title: raw.title ?? "",
        artist,
        artist_eff: normalizeArtist(artist) || "Неизвестный",
        bpm: raw.bpm ?? null,
        key: raw.key ?? null,
        genres: mapGenres(genresFrom(raw.genres?.length ? raw.genres : (raw.genre ? [raw.genre] : undefined))),
        parts: raw.stage ? [raw.stage] : [],
        rating: null,
        marks: [],
        pool_type: audio?.version?.name ?? null,
        preview: isPreview,
        duration_sec: audio?.length_real && audio.length_real > 0 ? Math.round(audio.length_real) : (audio?.length ? Math.round(audio.length) : null),
        url: null,
      } satisfies RawTrack;
    });
  },
  fileUrl() {
    return null;
  },
  toFavorite,
  toTrack: baseTrack,
};

/* ---------- 36pool ---------- */

type Pool36Raw = {
  id: string;
  title?: string;
  artist?: { name?: string };
  bpm?: number | null;
  key?: string | null;
  night_time?: string | null;
  category?: string | null;
  genre?: string | null;
  duration_seconds?: number | null;
  playback_url?: string | null;
  s3_key?: string | null;
};

const pool36: PoolConnector = {
  id: "36pool",
  name: "36 Pool",
  domains: ["36pool.com"],
  searchUrl(query) {
    return `https://36pool.com/api/v1/tracks/search?query=${encodeURIComponent(query)}`;
  },
  parseResponse(json) {
    if (!Array.isArray(json)) return [];
    return json.map((t) => {
      const raw = t as Pool36Raw;
      const artist = raw.artist?.name ?? null;
      const title = raw.title ?? "";
      const keyCamelot = keyToCamelot(raw.key);
      return {
        pool: "36pool",
        track_id_on_pool: raw.id,
        title,
        artist,
        artist_eff: normalizeArtist(artist) || "Неизвестный",
        bpm: raw.bpm ?? null,
        key: raw.key ?? null,
        genres: mapGenres(raw.genre ? [raw.genre] : []),
        parts: raw.night_time ? [raw.night_time] : [],
        rating: null,
        marks: [],
        pool_type: raw.category ?? null,
        preview: false,
        duration_sec: raw.duration_seconds ?? null,
        url: raw.playback_url ?? null,
      } satisfies RawTrack;
    });
  },
  fileUrl(raw) {
    return raw.url;
  },
  toFavorite,
  toTrack: baseTrack,
};

export const POOLS: PoolConnector[] = [jesteipool, muzvizor, pool36];

export function poolById(id: string): PoolConnector | undefined {
  return POOLS.find((p) => p.id === id);
}

export function poolByDomain(host: string): PoolConnector | undefined {
  return POOLS.find((p) => p.domains.some((d) => host === d || host.endsWith("." + d)));
}

/** Собрать запрос из ключевых слов: артист + название отдельными словами (полная фраза 36pool не находит). */
export function keywordsFromTrack(title: string, artist: string | null): string {
  return [artist, stripVersionSuffixes(title)].filter(Boolean).join(" ");
}
