/** Background service worker (MV3): перехват скачиваний + классификация + IndexedDB. */

import { DB } from "../lib/db";
import { getSettings } from "../lib/storage";
import { buildFilePath, previewFilePath, resolveCollision } from "../lib/path";
import {
  normalizeStr,
  artistFromTitle,
  looksLikePreview,
  normalizeArtist,
  extractVersion,
  isAudioUrl,
} from "../lib/normalize";
import { detectLang, effArtist, partsFromLabels, buildComment, poolPrefix } from "../lib/classify";
import { poolById, type RawTrack } from "../lib/pools";
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

/** Есть ли у url пул-домен (для blob: и data: referrer-проверки). */
function isPoolReferrer(url: string): boolean {
  return POOL_DOMAINS.some((d) => url.includes(d));
}

/** Является ли загрузка аудио с пула (по mime, имени файла или пути). */
function isAudioDownload(item: chrome.downloads.DownloadItem): boolean {
  const mime = item.mime ?? "";
  if (mime.startsWith("audio/")) return true;
  if (isAudioUrl(item.filename ?? "")) return true;
  if (isAudioUrl(item.url)) return true;
  // Типичные эндпоинты скачивания пулов без расширения в URL
  try {
    if (/(?:play|download|stream|file|track|audio|source)/i.test(new URL(item.url).pathname)) return true;
  } catch {
    // blob:/data: URL без pathname — проверяем referrer
  }
  return false;
}

/** Реальный домен загрузки: для blob:/data: используем referrer, иначе сам url. */
function downloadSource(item: chrome.downloads.DownloadItem): string {
  const u = item.url || "";
  if (u.startsWith("blob:") || u.startsWith("data:")) return item.referrer ?? u;
  return u;
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
    track_id_on_pool: null,
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
  const source = downloadSource(item);
  if (!isPoolUrl(source) && !isPoolReferrer(source)) return;
  if (!isAudioDownload(item)) return;

  // Важно (MV3): при асинхронном suggest() слушатель должен вернуть `true`,
  // а не Promise — иначе Chrome сам вызовет suggest() и будет «suggestCallback may not be called more than once».
  void (async () => {
    try {
      const settings = await getSettings();
      const track = trackFromFilename(item, settings);
      const existing = await findDuplicate(track.artist_eff, track.title);

      if (existing) {
        // Дубликат: не кладём повторно, но направляем в существующий путь
        suggest({ filename: existing.file_path ?? buildFilePath(existing, settings) });
        return;
      }

      // Метаданные из API пула (BPM, тональность, части ночи...) — источник истины,
      // если карточка/имя файла не дали полных данных.
      if (track.pool !== "unknown") {
        const r = await enrich(
          { pool: track.pool, track_id_on_pool: "", title: track.title, artist: track.artist },
          3000,
        );
        if (r.bpm != null) track.bpm = r.bpm;
        if (r.key != null) track.key = r.key;
        if (r.genres?.length) track.genres = r.genres;
        if (r.parts?.length) track.parts = r.parts as Part[];
        if (r.rating != null) track.rating = r.rating;
        if (r.marks?.length) track.marks = r.marks;
        if (r.pool_type) track.pool_type = r.pool_type;
        if (r.duration_sec != null) track.duration_sec = r.duration_sec;
        if (r.track_id_on_pool) track.track_id_on_pool = r.track_id_on_pool;
        track.comment = buildComment(track, poolPrefix(track.pool)) || null;
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
  return true;
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

/* ---------- Обогащение метаданных через API пула ---------- */

/** Лучшее совпадение из результатов поиска пула по названию/артисту. */
function bestMatch(list: RawTrack[], raw: RawTrackMsg): RawTrack | undefined {
  if (!list.length) return undefined;
  const t = normalizeStr(raw.title);
  const a = normalizeStr(raw.artist ?? "");
  const scored = list.map((tr) => {
    const tt = normalizeStr(tr.title);
    const ta = normalizeStr(tr.artist_eff);
    let score = 0;
    if (tt === t) score += 3;
    else if (t && (tt.includes(t) || t.includes(tt))) score += 1;
    if (a && ta && (ta.includes(a) || a.includes(ta))) score += 1;
    return { tr, score };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored[0].tr;
}

/** Запросы-кандидаты для поиска метаданных: артист → «артист + название» → название. */
function searchQueries(raw: RawTrackMsg): string[] {
  const artist = raw.artist?.trim() ?? "";
  const title = raw.title?.trim() ?? "";
  const out: string[] = [];
  if (artist) out.push(artist);
  if (artist && title) out.push(`${artist} ${title}`);
  if (title) out.push(title);
  return out.filter((q) => q.length > 0);
}

/** Запросить API пула по названию+артисту и дозаполнить поля (bpm, key, genres, parts, url...). */
async function enrich(raw: RawTrackMsg, timeoutMs = 6000): Promise<RawTrackMsg> {
  const connector = poolById(raw.pool);
  const queries = searchQueries(raw);
  if (!connector || !queries.length) return raw;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (const q of queries) {
      const res = await fetch(connector.searchUrl(q), { signal: ctrl.signal });
      if (!res.ok) continue;
      const list = connector.parseResponse(await res.json());
      const best = bestMatch(list, raw);
      if (!best) continue;
      return {
        pool: best.pool,
        track_id_on_pool: best.track_id_on_pool || raw.track_id_on_pool,
        title: best.title || raw.title,
        artist: best.artist ?? raw.artist,
        bpm: best.bpm ?? raw.bpm ?? null,
        key: best.key ?? raw.key ?? null,
        genres: best.genres?.length ? best.genres : (raw.genres ?? []),
        parts: best.parts?.length ? best.parts : (raw.parts ?? []),
        rating: best.rating ?? raw.rating ?? null,
        marks: best.marks?.length ? best.marks : (raw.marks ?? []),
        pool_type: best.pool_type ?? raw.pool_type ?? null,
        preview: best.preview ?? raw.preview ?? false,
        duration_sec: best.duration_sec ?? raw.duration_sec ?? null,
        url: best.url ?? raw.url ?? null,
      };
    }
    return raw;
  } catch {
    return raw;
  } finally {
    clearTimeout(timer);
  }
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
  const r = await enrich(raw);
  const existing = (await DB.allFavorites()).find(
    (f) => f.pool === r.pool && f.track_id_on_pool === r.track_id_on_pool,
  );
  if (existing) return;
  await DB.addFavorite({
    id: crypto.randomUUID(),
    pool: r.pool,
    track_id_on_pool: r.track_id_on_pool,
    title: r.title,
    artist: r.artist,
    url: r.url ?? null,
    meta: {
      bpm: r.bpm ?? null,
      key: r.key ?? null,
      genres: r.genres ?? [],
      parts: (r.parts ?? []) as Part[],
      rating: r.rating ?? null,
      marks: r.marks ?? [],
      comment: buildComment(
        { parts: (r.parts ?? []) as Part[], genres: r.genres ?? [], marks: r.marks ?? [], pool_type: r.pool_type ?? null },
        poolPrefix(r.pool),
      ) || null,
    },
    status: "new",
    local_path: null,
    added_at: new Date().toISOString(),
    synced: false,
  });
}

/** Открыть страницу трека в фоне и попросить content script кликнуть штатную кнопку скачивания. */
async function openTrackAndAutoDownload(pageUrl: string): Promise<void> {
  const tab = await chrome.tabs.create({ url: pageUrl, active: false });
  const tabId = tab.id!;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 8000);
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
  try {
    await chrome.tabs.sendMessage(tabId, { type: "AUTO_DOWNLOAD" });
  } catch {
    // content script ещё не встроен или страница не пул — пропускаем
  }
}

async function downloadRaw(raw: RawTrackMsg): Promise<{ ok: boolean; needClick?: boolean; viaTab?: boolean }> {
  const r = await enrich(raw);
  const url = r.url;

  // 36pool: playback_url — полный MP3, скачиваем напрямую
  if (r.pool === "36pool" && url && isAudioUrl(url)) {
    const track = buildTrackFromRaw(r, url);
    const settings = await getSettings();
    const path = resolveCollision(buildFilePath(track, settings), await existingPaths());
    track.file_path = path;
    await DB.addTrack(track);
    await chrome.downloads.download({ url, filename: path });
    return { ok: true };
  }

  // jesteipool: play URL — только превью; полный файл отдаёт сайт под сессией
  if (r.pool === "jesteipool" && /^\d+$/.test(r.track_id_on_pool || "")) {
    await openTrackAndAutoDownload(`https://jesteipool.ru/track/${r.track_id_on_pool}`);
    return { ok: true, viaTab: true };
  }

  const looksDownloadable =
    !!url &&
    (isAudioUrl(url) ||
      (() => {
        try {
          return isPoolUrl(url) && /(?:play|download|stream|file|track|audio|source)/i.test(new URL(url).pathname);
        } catch {
          return false;
        }
      })());
  if (!looksDownloadable) {
    // Нет прямого аудио-URL — пусть content script кликнет штатную кнопку сайта
    return { ok: false, needClick: true };
  }
  const track = buildTrackFromRaw(r, url);
  const settings = await getSettings();
  const path = resolveCollision(buildFilePath(track, settings), await existingPaths());
  track.file_path = path;
  await DB.addTrack(track);
  await chrome.downloads.download({ url, filename: path });
  return { ok: true };
}

function buildTrackFromRaw(r: RawTrackMsg, url: string): Track {
  return {
    id: crypto.randomUUID(),
    title: r.title,
    artist: r.artist,
    artist_eff: r.artist ? effArtist(r.artist) : normalizeArtist(r.artist ?? "") || "Неизвестный",
    bpm: r.bpm ?? null,
    key: r.key ?? null,
    genres: r.genres ?? [],
    parts: partsFromLabels(r.parts ?? []),
    lang: detectLang(r.title, r.artist),
    rating: r.rating ?? null,
    marks: r.marks ?? [],
    pool: r.pool,
    pool_type: r.pool_type ?? null,
    preview: r.preview ?? false,
    comment: buildComment(
      { parts: partsFromLabels(r.parts ?? []), genres: r.genres ?? [], marks: r.marks ?? [], pool_type: r.pool_type ?? null },
      poolPrefix(r.pool),
    ) || null,
    file_path: null,
    file_size: null,
    duration_sec: r.duration_sec ?? null,
    bitrate: null,
    sample_rate: null,
    url,
    file_ext: null,
    downloaded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    synced: false,
  };
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
      .then((r) => sendResponse(r))
      .catch(() => sendResponse({ ok: false, error: "download failed" }));
    return true;
  }
  if (msg.type === "FAVORITE_DOWNLOAD") {
    void downloadRaw(p)
      .then((r) => sendResponse(r))
      .catch(() => sendResponse({ ok: false, error: "download failed" }));
    return true;
  }
  return undefined;
});
