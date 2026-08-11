/** Background service worker (MV3): перехват скачиваний + классификация + IndexedDB. */

import { DB } from "../lib/db";
import { getSettings } from "../lib/storage";
import { buildFilePath, previewFilePath, resolveCollision } from "../lib/path";
import { normalizeStr, artistFromTitle, looksLikePreview, normalizeArtist, extractVersion } from "../lib/normalize";
import { detectLang, effArtist, partsFromLabels } from "../lib/classify";
import type { Track, Part, Settings } from "../lib/types";

/** Домены пулов + их хранилища (S3), чьи скачивания мы обрабатываем. */
const POOL_DOMAINS = [
  "jesteipool.ru",
  "rest.jesteipool.ru",
  "muzvizor.com",
  "36pool.com",
  "twcstorage.ru", // s3 36pool
  "yandexcloud.net", // s3 jesteipool
];
function isPoolUrl(url: string): boolean {
  try {
    return POOL_DOMAINS.some((d) => new URL(url).hostname === d || new URL(url).hostname.endsWith(d));
  } catch {
    return false;
  }
}

const AUDIO_EXTS = ["mp3", "wav", "flac", "m4a", "aac", "ogg", "opus", "aiff", "aif", "alac", "m4b"];

function isAudioUrl(url: string): boolean {
  return new RegExp(`\\.(${AUDIO_EXTS.join("|")})([?#].*)?$`, "i").test(url) || url.includes("audio");
}

/** Является ли загрузка аудио с пула (по mime, имени файла или пути). */
function isAudioDownload(item: chrome.downloads.DownloadItem): boolean {
  const mime = item.mime ?? "";
  if (mime.startsWith("audio/")) return true;
  if (new RegExp(`\\.(${AUDIO_EXTS.join("|")})([?#].*)?$`, "i").test(item.filename ?? "")) return true;
  if (new RegExp(`\\.(${AUDIO_EXTS.join("|")})([?#].*)?$`, "i").test(item.url)) return true;
  // Типичные эндпоинты скачивания пулов без расширения в URL
  if (/(?:play|download|stream|file|track|audio|source)/i.test(new URL(item.url).pathname)) return true;
  return false;
}

/** Извлечение артиста/названия из имени скачанного файла "Артист - Название (suffix).ext". */
function parseFilename(filename: string): { artist: string | null; title: string } {
  const base = filename.replace(/\.[^.]+$/, "");
  const m = base.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: null, title: base.trim() };
}

/** Построить track из имени файла (минимум для 2a; коннекторы API — этап 2c). */
function trackFromFilename(item: chrome.downloads.DownloadItem, _settings: Settings): Track {
  const { artist, title } = parseFilename(item.filename ?? "unknown.mp3");
  const version = extractVersion(title);
  const artistEff = artist ? effArtist(artist) : normalizeArtist(artistFromTitle(title)) || "Неизвестный";
  const lang = detectLang(title, artist);
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: version.base || title,
    artist,
    artist_eff: artistEff,
    bpm: null,
    key: null,
    genres: [],
    parts: [] as Part[],
    lang,
    rating: null,
    marks: [],
    pool: detectPool(item),
    pool_type: version.version,
    preview: false,
    comment: null,
    file_path: null,
    file_size: item.fileSize ?? null,
    duration_sec: null,
    bitrate: null,
    sample_rate: null,
    url: item.url || null,
    file_ext: (item.filename?.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase() || null,
    downloaded_at: now,
    updated_at: now,
    synced: false,
  };
}

function detectPool(item: chrome.downloads.DownloadItem): string {
  const u = (item.url || item.referrer || "").toLowerCase();
  if (u.includes("jesteipool")) return "jesteipool";
  if (u.includes("muzvizor")) return "muzvizor";
  if (u.includes("36pool") || u.includes("twcstorage")) return "36pool";
  return "unknown";
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (!isPoolUrl(item.url) && !isPoolUrl(item.referrer || "")) return;
  if (!isAudioDownload(item)) return;

  // В MV3: для асинхронного suggest() слушатель должен вернуть Promise.
  return (async () => {
    try {
      const settings = await getSettings();
      const track = trackFromFilename(item, settings);
      const existing = await findDuplicate(track.artist_eff, track.title);

      if (existing) {
        // Дубликат: не кладём повторно, но направляем в существующий путь
        suggest({ filename: existing.file_path ?? buildFilePath(existing, settings) });
        return;
      }

      // Превью: маленький файл или раньше был помечен пулом
      if (looksLikePreview(item.fileSize, track.file_ext) && !item.url.includes("play")) {
        track.preview = true;
        const path = previewFilePath(track);
        track.file_path = path;
        suggest({ filename: path });
      } else {
        const path = resolveCollision(buildFilePath(track, settings), await existingPaths());
        track.file_path = path;
        suggest({ filename: path });
      }
      await DB.addTrack(track);
    } catch {
      // Если что-то пошло не так — не блокируем скачивание
    }
  })();
});

/** Коллизии: уже сохранённые пути в IndexedDB. */
async function existingPaths(): Promise<Set<string>> {
  const all = await DB.allTracks();
  return new Set(all.map((t) => t.file_path).filter(Boolean) as string[]);
}

async function findDuplicate(artistEff: string, title: string): Promise<Track | undefined> {
  const all = await DB.allTracks();
  return all.find(
    (t) => normalizeStr(t.artist_eff) === normalizeStr(artistEff) && normalizeStr(t.title) === normalizeStr(title),
  );
}

/* ---------- Сообщения от content script ---------- */

interface RawTrackMsg {
  pool: string;
  track_id_on_pool: string;
  title: string;
  artist: string | null;
  bpm?: number | null;
  key?: string | null;
  genres?: string[];
  parts?: string[];
  rating?: number | null;
  marks?: string[];
  pool_type?: string | null;
  preview?: boolean;
  duration_sec?: number | null;
  url?: string | null;
}

async function addFavorite(raw: RawTrackMsg): Promise<void> {
  const existing = (await DB.allFavorites()).find(
    (f) => f.pool === raw.pool && f.track_id_on_pool === raw.track_id_on_pool,
  );
  if (existing) return;
  await DB.addFavorite({
    id: crypto.randomUUID(),
    pool: raw.pool,
    track_id_on_pool: raw.track_id_on_pool,
    title: raw.title,
    artist: raw.artist,
    url: raw.url ?? null,
    meta: {
      bpm: raw.bpm ?? null,
      key: raw.key ?? null,
      genres: raw.genres ?? [],
      parts: (raw.parts ?? []) as Part[],
      rating: raw.rating ?? null,
      marks: raw.marks ?? [],
    },
    status: "new",
    local_path: null,
    added_at: new Date().toISOString(),
    synced: false,
  });
}

async function downloadRaw(raw: RawTrackMsg): Promise<void> {
  const url = raw.url;
  if (!url) return;
  const track: Track = {
    id: crypto.randomUUID(),
    title: raw.title,
    artist: raw.artist,
    artist_eff: raw.artist ? effArtist(raw.artist) : normalizeArtist(raw.artist ?? "") || "Неизвестный",
    bpm: raw.bpm ?? null,
    key: raw.key ?? null,
    genres: raw.genres ?? [],
    parts: partsFromLabels(raw.parts ?? []),
    lang: detectLang(raw.title, raw.artist),
    rating: raw.rating ?? null,
    marks: raw.marks ?? [],
    pool: raw.pool,
    pool_type: raw.pool_type ?? null,
    preview: raw.preview ?? false,
    comment: null,
    file_path: null,
    file_size: null,
    duration_sec: raw.duration_sec ?? null,
    bitrate: null,
    sample_rate: null,
    url,
    file_ext: null,
    downloaded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    synced: false,
  };
  const settings = await getSettings();
  const path = resolveCollision(buildFilePath(track, settings), await existingPaths());
  track.file_path = path;
  await DB.addTrack(track);
  await chrome.downloads.download({ url, filename: path });
}

chrome.runtime.onMessage.addListener((msg: { type?: string; payload?: RawTrackMsg }, _sender, sendResponse) => {
  if (!msg?.payload) return;
  const p = msg.payload;
  if (msg.type === "FAVORITE_ADD") {
    void addFavorite(p)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false, error: "favorite add failed" }));
    return true;
  }
  if (msg.type === "DOWNLOAD") {
    void downloadRaw(p)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false, error: "download failed" }));
    return true;
  }
  return undefined;
});
