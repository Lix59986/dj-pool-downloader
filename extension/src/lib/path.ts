/** Формирование пути файла в папке muzz по режиму раскладки. */

import type { Layout, Part, Settings, Track } from "./types";
import { sanitizeName, uniqueName } from "./normalize";
import { firstPart } from "./classify";

const PARTS_DIR: Record<Part, string> = {
  Open: "Open",
  Primetime: "Primetime",
  Close: "Close",
};

/** Группы-каталоги (для режимов artist/genre). */
export const GENRES_DIR = [
  "Поп", "Хаус", "Афро-хаус", "Хип-хоп/Рэп", "Фонк", "Рок/Метал/Панк",
  "Драм-н-бейс", "Техно/Транс", "Бас/Дабстеп", "Бейл-фанк", "Рейв",
  "Фанк/Диско", "UK Garage", "Альтернатива/Инди", "Лаунж/Джаз", "R&B/Соул",
  "Электроника", "Дэнс", "Клубная", "EDM", "Другое",
];

/** Часть ночи (для папки, с языком) → каталог. */
export function partsDir(parts: Part[], lang: "RU" | "Foreign", noPart = false): string {
  if (noPart) return "Без части ночи";
  const part = firstPart(parts);
  if (!part) return "Без части ночи";
  return `${PARTS_DIR[part]} ${lang}`;
}

/** Разрешить переменные шаблона путей. */
function resolveTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{([^{}]+)\}/g, (_m, name: string) => {
    const v = vars[name];
    return v !== undefined ? sanitizeName(v) : "";
  });
}

/** Составить относительный путь файла (muzz/...). ext без точки. */
export function buildFilePath(track: Track, settings: Settings): string {
  const artist = track.artist && track.artist.trim() ? track.artist.trim() : "Неизвестный";
  const title = track.title.trim();
  const ext = track.url?.split(".").pop()?.toLowerCase() || "mp3";
  const safeArtist = sanitizeName(artist);
  const safeTitle = sanitizeName(title);

  const vars: Record<string, string> = {
    База: "muzz",
    "Часть ночи": partsDir(track.parts, track.lang, track.parts.length === 0),
    Жанр: track.genres[0] ?? "Другое",
    Артист: safeArtist,
    Название: safeTitle,
    ext,
  };

  let path: string;
  switch (settings.layout) {
    case "night":
      path = `muzz/Часть ночи/${vars["Часть ночи"]}/${safeArtist} - ${safeTitle}.${ext}`;
      break;
    case "artist":
      path = `muzz/Артист/${safeArtist}/${safeArtist} - ${safeTitle}.${ext}`;
      break;
    case "genre":
      path = `muzz/Жанр/${vars["Жанр"]}/${safeArtist} - ${safeTitle}.${ext}`;
      break;
    case "flat":
      path = `muzz/${safeArtist} - ${safeTitle}.${ext}`;
      break;
    case "custom":
    default:
      path = resolveTemplate(settings.template || DEFAULT_TEMPLATE, vars);
      break;
  }

  // Безопасность: исключить выход за пределы muzz через ".."
  const normalized = path.split("/").filter((p) => p !== "" && p !== "." && p !== "..");
  return normalized.join("/");
}

const DEFAULT_TEMPLATE = "muzz/{Жанр}/{Часть ночи}/{Артист} - {Название}.{ext}";

/** Превью всегда в muzz/_preview/. */
export function previewFilePath(track: Track): string {
  const artist = track.artist && track.artist.trim() ? track.artist.trim() : "Неизвестный";
  const safe = `${sanitizeName(artist)} - ${sanitizeName(track.title)}.mp3`;
  return `muzz/_preview/${safe}`;
}

/** Разрешение коллизий: проверить существующие пути и добавить " (2)". */
export function resolveCollision(path: string, existing: Set<string>): string {
  if (!existing.has(path)) return path;
  const extIdx = path.lastIndexOf(".");
  const base = extIdx > 0 ? path.slice(0, extIdx) : path;
  const ext = extIdx > 0 ? path.slice(extIdx) : "";
  return uniqueName(base, ext, existing);
}
