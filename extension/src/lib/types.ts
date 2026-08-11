/** Общие типы расширения. */

export type Layout = "night" | "artist" | "genre" | "flat" | "custom";

export type Lang = "RU" | "Foreign";

export type Part = "Open" | "Primetime" | "Close";

export type FavoriteStatus = "new" | "done" | "preview" | "error";

/** Трек в локальной IndexedDB. */
export interface Track {
  id: string;
  title: string;
  artist: string | null;
  artist_eff: string;
  bpm: number | null;
  key: string | null;
  genres: string[]; // наши группы (Поп, Хаус, ...)
  parts: Part[]; // Open/Primetime/Close
  lang: Lang;
  rating: number | null; // 1–5
  marks: string[];
  pool: string; // jesteipool | muzvizor | 36pool | ...
  track_id_on_pool?: string | null; // id трека на пуле (для ссылок и дедупликации)
  pool_type: string | null; // тип версии с пула (Remix, Intro, ...) — в комментарий
  preview: boolean;
  comment: string | null;
  file_path: string | null; // относительный путь от папки загрузок (muzz/...)
  file_size: number | null;
  duration_sec: number | null;
  bitrate: number | null;
  sample_rate: number | null;
  url: string | null;
  file_ext: string | null; // mp3/wav/flac/m4a/aac/ogg из реального имени файла
  downloaded_at: string | null;
  updated_at: string;
  synced: boolean;
}

/** Избранное. */
export interface Favorite {
  id: string;
  pool: string;
  track_id_on_pool: string | null;
  title: string;
  artist: string | null;
  url: string | null;
  meta: {
    bpm?: number | null;
    key?: string | null;
    genres?: string[];
    parts?: Part[];
    rating?: number | null;
    marks?: string[];
    comment?: string | null;
  } | null;
  status: FavoriteStatus;
  local_path: string | null;
  added_at: string;
  synced: boolean;
}

/** Настройки расширения (chrome.storage.local). */
export interface Settings {
  backendUrl: string;
  token: string | null;
  user: { id: string; email: string } | null;
  downloadFolder: string; // абсолютная папка загрузок (для XML/M3U8)
  layout: Layout;
  template: string; // пользовательский шаблон путей
}

export const DEFAULT_SETTINGS: Settings = {
  backendUrl: "https://dj-pool-downloader.vercel.app",
  token: null,
  user: null,
  downloadFolder: "",
  layout: "night",
  template: "muzz/{Жанр}/{Часть ночи}/{Артист} - {Название}.{ext}",
};
