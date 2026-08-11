/** Классификация трека из метаданных пула. */
import type { Part, Lang } from "./types";
import { mapGenre } from "./genre_map";
import { normalizeArtist } from "./normalize";

/** Приоритет части ночи для выбора папки: Open > Primetime > Close. */
const PART_PRIORITY: Part[] = ["Open", "Primetime", "Close"];

/** Известные русские исполнители латиницей. */
const RUSSIAN_LATIN: string[] = [
  "zivert",
  "vldk",
  "dj smash",
  "kolya funk",
  "iowa",
  "big baby tape",
  "kizaru",
  "artik & asti",
  "morgenshtern",
  "elman",
  "egor kreed",
  "klava koka",
  "niletto",
  "lovv66",
  "mayot",
  "sektor gaz",
];

/** Язык: кириллица в названии или артисте → RU. */
export function detectLang(title: string, artist: string | null): Lang {
  if (/[а-яА-ЯёЁ]/.test(title + " " + (artist ?? ""))) return "RU";
  const a = (artist ?? "").toLowerCase();
  if (RUSSIAN_LATIN.some((name) => a.includes(name))) return "RU";
  return "Foreign";
}

/** Маппинг метки пула → наша часть ночи. */
export function mapPart(label: string | null | undefined): Part | null {
  switch ((label ?? "").toLowerCase()) {
    case "opening":
    case "warmup":
    case "pre-party":
    case "preparty":
      return "Open";
    case "primetime":
    case "prime":
    case "prime time":
      return "Primetime";
    case "closing":
    case "afterparty":
    case "close":
      return "Close";
    case "background":
    case "background":
      return "Open";
    default:
      return null;
  }
}

/** Уникальные части ночи из меток пула, в порядке приоритета. */
export function partsFromLabels(labels: (string | null | undefined)[]): Part[] {
  const set = new Set<Part>();
  for (const label of labels) {
    const part = mapPart(label);
    if (part) set.add(part);
  }
  return PART_PRIORITY.filter((p) => set.has(p));
}

/** Первая часть ночи для имени папки. */
export function firstPart(parts: Part[]): Part | null {
  return PART_PRIORITY.find((p) => parts.includes(p)) ?? null;
}

/** Рейтинг пула 1–5 → Rating Rekordbox (20/40/60/80/100). */
export function ratingToRekordbox(rating: number | null | undefined): number {
  if (!rating) return 0;
  return Math.min(5, Math.max(1, rating)) * 20;
}

/** Рейтинг пула 1–5 → Traktor (0–255, 255 = 5★). */
export function ratingToTraktor(rating: number | null | undefined): number {
  if (!rating) return 0;
  return Math.round((Math.min(5, Math.max(1, rating)) / 5) * 255);
}

/** Нормализованные жанры пула → группы (словарь genre_map). */
export function mapGenres(genres: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const g of genres) out.add(mapGenre(g));
  return Array.from(out);
}

/** Нормализация артиста. */
export function effArtist(artist: string | null | undefined): string {
  return normalizeArtist(artist) || "Неизвестный";
}

/** Ключ 36pool (C#m) → Camelot (12A) для Rekordbox. */
const PITCH_TO_CAMELOT: Record<string, string> = {
  C: "8B", "C#": "3B", D: "10B", "D#": "5B", E: "12B", F: "7B",
  "F#": "2B", G: "9B", "G#": "4B", A: "11B", "A#": "6B", B: "1B",
  Cm: "3A", "C#m": "10A", Dm: "5A", "D#m": "12A", Em: "7A", Fm: "2A",
  "F#m": "9A", Gm: "4A", "G#m": "11A", Am: "6A", "A#m": "1A", Bm: "8A",
};

/** Музыкальная нотация (C#m, F) → Camelot (12A). Возвращает null если не удалось. */
export function keyToCamelot(key: string | null | undefined): string | null {
  if (!key) return null;
  const k = key.trim();
  const camelot = k.match(/^(\d{1,2})([AB])$/i);
  if (camelot) return `${camelot[1]}${camelot[2].toUpperCase()}`;
  return PITCH_TO_CAMELOT[k] ?? null;
}
