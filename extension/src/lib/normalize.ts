/** Нормализация названий/артистов и утилиты имён. */

/** Запрещённые в именах файлов символы → "_". */
export function sanitizeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
}

/** Нормализация строки для сравнения: нижний регистр, сжать пробелы, убрать пунктуацию. */
export function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[()[\].'`",;!?–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Убрать суффиксы-версии из названия: "Candy Shop (Lilian Bilotta Remix)" → "Candy Shop". */
export function stripVersionSuffixes(title: string): string {
  return title.replace(
    /\s*\([^)]*\b(?:remix|intro|extended|edit|bootleg|transition|live|acapella|instrumental|dj)\b[^)]*\)/i,
    "",
  ).trim();
}

/** Убрать суффикс версии, но вернуть его отдельно ("Remix"/"Intro"/...). */
export function extractVersion(title: string): { base: string; version: string | null } {
  const m = title.match(/\([^)]*\b(remix|intro|extended|edit|bootleg|transition|live|acapella|instrumental)\b[^)]*\)/i);
  const version = m ? m[1] : null;
  return { base: stripVersionSuffixes(title), version };
}

/** Нормализованный артист для поиска дубликатов: "50 Cent, Governor" → "50 cent; governor". */
export function normalizeArtist(artist: string | null | undefined): string {
  if (!artist) return "";
  return artist
    .split(/\s*(?:,|&|feat\.|ft\.|\/|\\)\s*/i)
    .map((a) => normalizeStr(a))
    .filter(Boolean)
    .join("; ");
}

/** Артист из начала названия: "VLDK - my name" → "VLDK". */
export function artistFromTitle(title: string): string | null {
  const m = title.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  return m ? m[1].trim() : null;
}

/** Уникальное имя файла при коллизии: "файл (2).mp3". */
export function uniqueName(base: string, ext: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

/** Проверка: похоже на превью по размеру файла (байты). */
export function looksLikePreview(fileSizeBytes: number | undefined): boolean {
  if (fileSizeBytes === undefined) return false;
  // 90 сек MP3 320kbps ≈ 3.6 MB; превью обычно < 2.5 MB
  return fileSizeBytes < 2_500_000;
}
