import { describe, it, expect } from "vitest";
import { buildPlaylists, generateRekordboxXml, generateM3U8, locationUrl, trackComments, poolPrefix, m3u8Path } from "../rekordbox";
import type { Track } from "../types";

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    title: `Track ${id}`,
    artist: "Artist",
    artist_eff: "artist",
    bpm: 124,
    key: "5A",
    genres: ["Хаус"],
    parts: ["Primetime"],
    lang: "Foreign",
    rating: 4,
    marks: ["Русское"],
    pool: "jesteipool",
    pool_type: null,
    preview: false,
    comment: null,
    file_path: `muzz/Часть ночи/Primetime Foreign/Artist - Track ${id}.mp3`,
    file_size: 4906977,
    duration_sec: 121,
    bitrate: 320,
    sample_rate: 44100,
    url: "https://x/a.mp3",
    downloaded_at: "2026-08-11",
    updated_at: "2026-08-11",
    synced: true,
    ...overrides,
  };
}

const FOLDER = "C:/Users/vamvi/Downloads";

describe("locationUrl / m3u8Path", () => {
  it("формирует file://localhost URL без URL-кодирования", () => {
    expect(locationUrl(FOLDER, "muzz/Часть ночи/Primetime RU/Тест - Трек.mp3")).toBe(
      "file://localhost/C:/Users/vamvi/Downloads/muzz/Часть ночи/Primetime RU/Тест - Трек.mp3",
    );
  });
  it("формирует file:/// для M3U8", () => {
    expect(m3u8Path(FOLDER, "muzz/Часть ночи/Primetime RU/Тест - Трек.mp3")).toBe(
      "file:///C:/Users/vamvi/Downloads/muzz/Часть ночи/Primetime RU/Тест - Трек.mp3",
    );
  });
});

describe("trackComments", () => {
  it("префикс по пулу", () => {
    expect(trackComments(track("1"), "JP")).toBe("JP часть ночи: Primetime | JP жанры: Хаус | Маркировки: Русское");
    expect(poolPrefix("muzvizor")).toBe("MV");
    expect(poolPrefix("36pool")).toBe("36");
  });
});

describe("buildPlaylists", () => {
  it("мульти-метки: трек в нескольких плейлистах", () => {
    const t = track("1", { parts: ["Open", "Primetime"] });
    const { night, artists, genres } = buildPlaylists([t]);
    expect(night.find((n) => n.name === "Open Foreign")!.trackIds).toContain("1");
    expect(night.find((n) => n.name === "Primetime Foreign")!.trackIds).toContain("1");
    expect(night.find((n) => n.name === "Close Foreign")!.trackIds).not.toContain("1");
  });
  it("без части ночи → Без части ночи", () => {
    const t = track("1", { parts: [] });
    const { night } = buildPlaylists([t]);
    expect(night.find((n) => n.name === "Без части ночи")!.trackIds).toContain("1");
  });
  it("превью не попадает в плейлисты", () => {
    const t = track("1", { preview: true });
    const { night, genres } = buildPlaylists([t]);
    const all = night.flatMap((n) => n.trackIds).concat(genres.flatMap((g) => g.trackIds));
    expect(all).not.toContain("1");
  });
  it("артист — только ≥3 треков", () => {
    const tracks = [1, 2, 3].map((i) => track(String(i), { artist_eff: "artist" }));
    const { artists } = buildPlaylists(tracks);
    expect(artists.find((a) => a.name === "artist")?.trackIds).toHaveLength(3);
    const { artists: artists2 } = buildPlaylists([track("1")]);
    expect(artists2).toHaveLength(0);
  });
});

describe("generateRekordboxXml", () => {
  it("валидная структура XML", () => {
    const xml = generateRekordboxXml([track("1")], FOLDER);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<DJ_PLAYLISTS Version="1.0.0">');
    expect(xml).toContain('Name="rekordbox" Version="6.8.6"');
    expect(xml).toContain('Rating="80"');
    expect(xml).toContain('AverageBpm="124.00"');
    expect(xml).toContain('TotalTime="121"');
    expect(xml).toContain('Location="file://localhost/');
    expect(xml).toContain("</DJ_PLAYLISTS>");
  });
  it("Rating: 1★→20, 5★→100, без рейтинга→0", () => {
    const xml5 = generateRekordboxXml([track("5", { id: "x5", rating: 5 })], FOLDER);
    expect(xml5).toContain('Rating="100"');
    const xml1 = generateRekordboxXml([track("1", { id: "x1", rating: 1 })], FOLDER);
    expect(xml1).toContain('Rating="20"');
    const xml0 = generateRekordboxXml([track("0", { id: "x0", rating: null })], FOLDER);
    expect(xml0).toContain('Rating="0"');
  });
  it("XML-экранирование амперсанда", () => {
    const t = track("1", { title: "Artik & Asti" });
    const xml = generateRekordboxXml([t], FOLDER);
    expect(xml).toContain("Artik &amp; Asti");
  });
  it("переносы CRLF", () => {
    const xml = generateRekordboxXml([track("1")], FOLDER);
    expect(xml).toContain("\r\n");
  });
});

describe("generateM3U8", () => {
  it("генерирует файл с #EXTINF и путём", () => {
    const files = generateM3U8([track("1")], FOLDER);
    const key = Array.from(files.keys()).find((k) => k.includes("Primetime Foreign"));
    expect(key).toBeTruthy();
    const content = files.get(key!)!;
    expect(content).toContain("#EXTM3U");
    expect(content).toContain("#EXTINF:121,Artist - Track 1 [★4]");
    expect(content).toContain("file:///C:/Users/vamvi/Downloads/muzz/Часть ночи/Primetime Foreign/Artist - Track 1.mp3");
  });
});
