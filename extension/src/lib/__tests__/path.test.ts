import { describe, it, expect } from "vitest";
import { buildFilePath, previewFilePath, partsDir } from "../path";
import { DEFAULT_SETTINGS, type Track } from "../types";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "1",
    title: "In Da Club",
    artist: "50 Cent",
    artist_eff: "50 cent",
    bpm: 90,
    key: "8A",
    genres: ["Хип-хоп/Рэп"],
    parts: ["Primetime"],
    lang: "Foreign",
    rating: 4,
    marks: [],
    pool: "jesteipool",
    pool_type: null,
    preview: false,
    comment: null,
    file_path: null,
    file_size: 8000000,
    duration_sec: 180,
    bitrate: 320,
    sample_rate: 44100,
    url: "https://x/track.mp3",
    file_ext: "mp3",
    downloaded_at: "2026-01-01",
    updated_at: "2026-01-01",
    synced: false,
    ...overrides,
  };
}

describe("partsDir", () => {
  it("часть ночи + язык", () => {
    expect(partsDir(["Primetime"], "RU")).toBe("Primetime RU");
    expect(partsDir(["Open"], "Foreign")).toBe("Open Foreign");
  });
  it("без части ночи", () => {
    expect(partsDir([], "Foreign")).toBe("Без части ночи");
    expect(partsDir([], "Foreign", true)).toBe("Без части ночи");
  });
});

describe("buildFilePath", () => {
  it("режим night", () => {
    const t = makeTrack();
    expect(buildFilePath(t, DEFAULT_SETTINGS)).toBe("muzz/Часть ночи/Primetime Foreign/50 Cent - In Da Club.mp3");
  });
  it("режим artist", () => {
    expect(buildFilePath(makeTrack(), { ...DEFAULT_SETTINGS, layout: "artist" })).toBe("muzz/Артист/50 Cent/50 Cent - In Da Club.mp3");
  });
  it("режим genre", () => {
    expect(buildFilePath(makeTrack(), { ...DEFAULT_SETTINGS, layout: "genre" })).toBe("muzz/Жанр/Хип-хоп/Рэп/50 Cent - In Da Club.mp3");
  });
  it("режим flat", () => {
    expect(buildFilePath(makeTrack(), { ...DEFAULT_SETTINGS, layout: "flat" })).toBe("muzz/50 Cent - In Da Club.mp3");
  });
  it("безопасно от .. и слэшей", () => {
    const t = makeTrack({ artist: "a/b", title: "../x" });
    expect(buildFilePath(t, { ...DEFAULT_SETTINGS, layout: "flat" })).toBe("muzz/a_b - .._x.mp3");
  });
});

describe("previewFilePath", () => {
  it("превью в _preview", () => {
    expect(previewFilePath(makeTrack())).toBe("muzz/_preview/50 Cent - In Da Club.mp3");
  });
});
