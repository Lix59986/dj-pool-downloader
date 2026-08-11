/** Генерация Rekordbox XML и M3U8. */

import type { Track, Part, Settings } from "./types";
import { ratingToRekordbox, buildComment, poolPrefix } from "./classify";
import { sanitizeName } from "./normalize";

/** Полный абсолютный путь (file://localhost/...) из относительного file_path. */
export function locationUrl(downloadFolder: string, filePath: string | null): string {
  if (!filePath) return "";
  const abs = downloadFolder.replace(/\\/g, "/").replace(/\/$/, "") + "/" + filePath;
  return "file://localhost/" + abs;
}

/** М3У8-путь (file:///C:/...). */
export function m3u8Path(downloadFolder: string, filePath: string | null): string {
  if (!filePath) return "";
  const abs = downloadFolder.replace(/\\/g, "/").replace(/\/$/, "") + "/" + filePath;
  return "file:///" + abs;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

/** Comments трека: сохранённый в БД comment, либо составленный из классификации. */
export function trackComments(track: Track, prefix: string): string {
  if (track.comment) return track.comment;
  return buildComment(track, prefix);
}

export { poolPrefix };

/** Плейлисты: Часть ночи (по языку), Без части ночи, Артист, Жанр. */
export interface PlaylistDef {
  name: string;
  trackIds: string[]; // уникальные id треков в порядке добавления
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function partListNames(): string[] {
  const parts: Part[] = ["Open", "Primetime", "Close"];
  const langs = ["RU", "Foreign"] as const;
  const out: string[] = [];
  for (const p of parts) for (const l of langs) out.push(`${p} ${l}`);
  out.push("Без части ночи");
  return out;
}

/** Собрать плейлисты из треков (мульти-метки: трек в нескольких). */
export function buildPlaylists(tracks: Track[]): { night: PlaylistDef[]; artists: PlaylistDef[]; genres: PlaylistDef[] } {
  const night: PlaylistDef[] = partListNames().map((name) => ({ name, trackIds: [] }));
  const byName = new Map(night.map((n) => [n.name, n]));

  for (const t of tracks) {
    if (t.preview) continue; // превью не в списках
    if (t.parts.length === 0) {
      byName.get("Без части ночи")!.trackIds.push(t.id);
    } else {
      for (const p of t.parts) {
        const name = `${p} ${t.lang}`;
        byName.get(name)?.trackIds.push(t.id);
      }
    }
  }

  // Артисты (≥3 треков)
  const artistMap = new Map<string, string[]>();
  for (const t of tracks) {
    if (t.preview) continue;
    const key = t.artist_eff || "Неизвестный";
    const arr = artistMap.get(key) ?? [];
    arr.push(t.id);
    artistMap.set(key, arr);
  }
  const artists: PlaylistDef[] = [];
  for (const [name, ids] of artistMap) {
    if (ids.length >= 3) artists.push({ name: sanitizeName(name), trackIds: unique(ids) });
  }

  // Жанры
  const genreMap = new Map<string, string[]>();
  for (const t of tracks) {
    if (t.preview) continue;
    for (const g of t.genres) {
      const arr = genreMap.get(g) ?? [];
      arr.push(t.id);
      genreMap.set(g, arr);
    }
  }
  const genres: PlaylistDef[] = [];
  for (const [name, ids] of genreMap) genres.push({ name: sanitizeName(name), trackIds: unique(ids) });

  return { night, artists, genres };
}

/** Сгенерировать Rekordbox XML. */
export function generateRekordboxXml(tracks: Track[], downloadFolder: string): string {
  const pl = buildPlaylists(tracks);
  const lines: string[] = [];
  const trackById = new Map(tracks.map((t) => [t.id, t]));

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<DJ_PLAYLISTS Version="1.0.0">');
  lines.push('  <PRODUCT Name="rekordbox" Version="6.8.6" Company="AlphaTheta"/>');
  lines.push(`  <COLLECTION Entries="${tracks.length}">`);

  for (const t of tracks) {
    const loc = locationUrl(downloadFolder, t.file_path);
    if (!loc) continue;
    const bpm = t.bpm ? t.bpm.toFixed(2) : "0.00";
    const key = t.key ?? "";
    const size = t.file_size ?? 0;
    const totalTime = Math.round(t.duration_sec ?? 0);
    const rating = ratingToRekordbox(t.rating);
    const comments = trackComments(t, poolPrefix(t.pool));
    const title = sanitizeName(t.title);
    const artist = sanitizeName(t.artist ?? t.artist_eff ?? "");
    const added = (t.downloaded_at ?? new Date().toISOString()).slice(0, 10);

    lines.push(`    <TRACK TrackID="${t.id}" Name="${xmlEscape(title)}" Artist="${xmlEscape(artist)}"`);
    lines.push(`           Composer="" Album="" Grouping="" Genre="${xmlEscape(t.genres.join(", "))}"`);
    lines.push(`           Kind="MP3 файл" Size="${size}" TotalTime="${totalTime}" DiscNumber="1"`);
    lines.push(`           TrackNumber="1" Year="" AverageBpm="${bpm}" DateAdded="${added}"`);
    lines.push(`           BitRate="${t.bitrate ?? 0}" SampleRate="${t.sample_rate ?? 0}"`);
    lines.push(`           Comments="${xmlEscape(comments)}" PlayCount="0" Rating="${rating}"`);
    lines.push(`           Location="${xmlEscape(loc)}" Remixer="" Tonality="${xmlEscape(key)}" Label="" Mix="">`);
    lines.push(`      <TEMPO Inizio="0.025" Bpm="${bpm}" Metro="4/4" Battito="1"/>`);
    lines.push("    </TRACK>");
  }

  lines.push("  </COLLECTION>");

  const listNames = partListNames().filter((n) => (pl.night.find((x) => x.name === n)?.trackIds.length ?? 0) > 0);

  lines.push("  <PLAYLISTS>");
  lines.push('    <NODE Type="0" Name="ROOT" Count="1">');
  lines.push(`      <NODE Type="1" Name="muzz" Count="${3}">`);
  lines.push(`        <NODE Type="1" Name="Часть ночи" Count="${listNames.length}">`);
  for (const name of listNames) {
    const def = pl.night.find((x) => x.name === name)!;
    lines.push(`          <PLAYLIST Type="1" Name="${xmlEscape(name)}" Entries="${def.trackIds.length}" KeyType="0">`);
    for (const id of def.trackIds) lines.push(`            <TRACK Key="${id}"/>`);
    lines.push("          </PLAYLIST>");
  }
  lines.push("        </NODE>");

  if (pl.artists.length) {
    lines.push(`        <NODE Type="1" Name="Артист" Count="${pl.artists.length}">`);
    for (const def of pl.artists) {
      lines.push(`          <PLAYLIST Type="1" Name="${xmlEscape(def.name)}" Entries="${def.trackIds.length}" KeyType="0">`);
      for (const id of def.trackIds) lines.push(`            <TRACK Key="${id}"/>`);
      lines.push("          </PLAYLIST>");
    }
    lines.push("        </NODE>");
  }

  if (pl.genres.length) {
    lines.push(`        <NODE Type="1" Name="Жанр" Count="${pl.genres.length}">`);
    for (const def of pl.genres) {
      lines.push(`          <PLAYLIST Type="1" Name="${xmlEscape(def.name)}" Entries="${def.trackIds.length}" KeyType="0">`);
      for (const id of def.trackIds) lines.push(`            <TRACK Key="${id}"/>`);
      lines.push("          </PLAYLIST>");
    }
    lines.push("        </NODE>");
  }

  lines.push("      </NODE>");
  lines.push("    </NODE>");
  lines.push("  </PLAYLISTS>");
  lines.push("</DJ_PLAYLISTS>");

  return lines.join("\r\n");
}

/** Сгенерировать M3U8-плейлисты. Возвращает Map<имя файла, содержимое>. */
export function generateM3U8(tracks: Track[], downloadFolder: string): Map<string, string> {
  const pl = buildPlaylists(tracks);
  const out = new Map<string, string>();
  const trackById = new Map(tracks.map((t) => [t.id, t]));

  const addPlaylist = (name: string, trackIds: string[]) => {
    const fileName = `muzz - Часть ночи - ${sanitizeName(name)}.m3u8`;
    const lines: string[] = ["#EXTM3U"];
    for (const id of trackIds) {
      const t = trackById.get(id);
      if (!t) continue;
      const path = m3u8Path(downloadFolder, t.file_path);
      if (!path) continue;
      const sec = Math.round(t.duration_sec ?? 0);
      const rating = t.rating ? ` [★${t.rating}]` : "";
      lines.push(`#EXTINF:${sec},${sanitizeName(t.artist ?? t.artist_eff)} - ${sanitizeName(t.title)}${rating}`);
      lines.push(path);
    }
    out.set(fileName, lines.join("\r\n"));
  };

  const listNames = partListNames().filter((n) => (pl.night.find((x) => x.name === n)?.trackIds.length ?? 0) > 0);
  for (const name of listNames) {
    const def = pl.night.find((x) => x.name === name)!;
    addPlaylist(name, def.trackIds);
  }

  return out;
}

/** Длительность в секундах из метаданных пула. */
export function durationFromRaw(raw: unknown): number | null {
  if (typeof raw === "number") return raw;
  return null;
}
