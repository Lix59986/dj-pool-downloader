import { describe, it, expect } from "vitest";
import {
  sanitizeName,
  normalizeStr,
  stripVersionSuffixes,
  extractVersion,
  normalizeArtist,
  artistFromTitle,
  uniqueName,
  looksLikePreview,
} from "../normalize";

describe("sanitizeName", () => {
  it("заменяет запрещённые символы", () => {
    expect(sanitizeName('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
  });
  it("сжимает пробелы и обрезает края", () => {
    expect(sanitizeName("  Артист   Название  ")).toBe("Артист Название");
  });
});

describe("normalizeStr", () => {
  it("нижний регистр + сжатие", () => {
    expect(normalizeStr("  In Da Club  (Remix)  ")).toBe("in da club remix");
  });
});

describe("stripVersionSuffixes / extractVersion", () => {
  it("убирает суффикс версии из названия", () => {
    expect(stripVersionSuffixes("Candy Shop (Lilian Bilotta Remix)")).toBe("Candy Shop");
    expect(stripVersionSuffixes("Track (Intro Edit)")).toBe("Track");
    expect(stripVersionSuffixes("Plain Track")).toBe("Plain Track");
  });
  it("извлекает тип версии", () => {
    expect(extractVersion("Candy Shop (Lilian Bilotta Remix)")).toEqual({ base: "Candy Shop", version: "Remix" });
    expect(extractVersion("Boss (DJ Smash Edit)")).toEqual({ base: "Boss", version: "Edit" });
    expect(extractVersion("No Version")).toEqual({ base: "No Version", version: null });
  });
});

describe("normalizeArtist", () => {
  it("разделяет и чистит артистов", () => {
    expect(normalizeArtist("50 Cent, Governor")).toBe("50 cent; governor");
    expect(normalizeArtist("Artist feat. Guest")).toBe("artist; guest");
    expect(normalizeArtist(null)).toBe("");
  });
});

describe("artistFromTitle", () => {
  it("достаёт артиста из названия", () => {
    expect(artistFromTitle("VLDK - my name")).toBe("VLDK");
    expect(artistFromTitle("Просто трек")).toBeNull();
  });
});

describe("uniqueName", () => {
  it("разрешает коллизии", () => {
    const existing = new Set(["Track", "Track (2)"]);
    expect(uniqueName("Track", "mp3", existing)).toBe("Track (3)");
    expect(uniqueName("Other", "mp3", existing)).toBe("Other");
  });
});

describe("looksLikePreview", () => {
  it("определяет превью по размеру", () => {
    expect(looksLikePreview(1_500_000)).toBe(true);
    expect(looksLikePreview(8_000_000)).toBe(false);
    expect(looksLikePreview(undefined)).toBe(false);
  });
});
