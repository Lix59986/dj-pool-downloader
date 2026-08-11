/** Background service worker (MV3): перехват скачиваний + классификация + IndexedDB. */

import { DB } from "../lib/db";
import { getSettings } from "../lib/storage";
import { buildFilePath, previewFilePath, resolveCollision } from "../lib/path";
import { normalizeStr, artistFromTitle, looksLikePreview, normalizeArtist, extractVersion } from "../lib/normalize";
import { detectLang, effArtist } from "../lib/classify";
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

function isAudioUrl(url: string): boolean {
  return /\.(mp3|wav|flac|m4a|aac|ogg)([?#].*)?$/i.test(url) || url.includes("audio");
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

chrome.downloads.onDeterminingFilename.addListener(
  (item, suggest) => {
    if (!isPoolUrl(item.url) && !isPoolUrl(item.referrer || "")) return;
    if (!isAudioUrl(item.url) && !(item.filename?.toLowerCase().endsWith(".mp3"))) return;

    void (async () => {
      try {
        const settings = await getSettings();
        const track = trackFromFilename(item, settings);
        const existing = await findDuplicate(track.artist_eff, track.title);

        if (existing) {
          // Дубликат: не кладём повторно, но обновляем путь ссылкой на существующий
          suggest({ filename: existing.file_path ?? buildFilePath(existing, settings) });
          return;
        }

        // Превью: маленький файл или раньше был помечен пулом
        if (looksLikePreview(item.fileSize) && !item.url.includes("play")) {
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
  },
);

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
