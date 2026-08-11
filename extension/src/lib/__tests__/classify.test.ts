import { describe, it, expect } from "vitest";
import { mapPart, detectLang, ratingToRekordbox, ratingToTraktor, keyToCamelot, mapGenres } from "../classify";
import { mapGenre } from "../genre_map";

describe("mapPart", () => {
  it("маппит метки пулов", () => {
    expect(mapPart("Opening")).toBe("Open");
    expect(mapPart("warmup")).toBe("Open");
    expect(mapPart("Pre-Party")).toBe("Open");
    expect(mapPart("Background")).toBe("Open");
    expect(mapPart("Primetime")).toBe("Primetime");
    expect(mapPart("prime")).toBe("Primetime");
    expect(mapPart("Closing")).toBe("Close");
    expect(mapPart("afterparty")).toBe("Close");
    expect(mapPart("??")).toBeNull();
  });
});

describe("detectLang", () => {
  it("кириллица → RU", () => {
    expect(detectLang("Босая", "#2Маши")).toBe("RU");
  });
  it("латиница иноязычная → Foreign", () => {
    expect(detectLang("In Da Club", "50 Cent")).toBe("Foreign");
  });
  it("русские артисты латиницей → RU", () => {
    expect(detectLang("Some Track", "VLDK")).toBe("RU");
    expect(detectLang("Track", "DJ SMASH")).toBe("RU");
  });
});

describe("rating", () => {
  it("1–5 → Rekordbox 20–100", () => {
    expect(ratingToRekordbox(5)).toBe(100);
    expect(ratingToRekordbox(4)).toBe(80);
    expect(ratingToRekordbox(1)).toBe(20);
    expect(ratingToRekordbox(null)).toBe(0);
  });
  it("1–5 → Traktor 0–255", () => {
    expect(ratingToTraktor(5)).toBe(255);
    expect(ratingToTraktor(1)).toBe(51);
    expect(ratingToTraktor(null)).toBe(0);
  });
});

describe("keyToCamelot", () => {
  it("музыкальная нотация → Camelot", () => {
    expect(keyToCamelot("C#m")).toBe("10A");
    expect(keyToCamelot("Am")).toBe("6A");
    expect(keyToCamelot("G")).toBe("9B");
    expect(keyToCamelot("F#")).toBe("2B");
  });
  it("уже Camelot не меняет", () => {
    expect(keyToCamelot("5B")).toBe("5B");
    expect(keyToCamelot("12A")).toBe("12A");
  });
  it("мусор → null", () => {
    expect(keyToCamelot("???")).toBeNull();
    expect(keyToCamelot(null)).toBeNull();
  });
});

describe("mapGenre / mapGenres", () => {
  it("маппит жанры пулов", () => {
    expect(mapGenre("Tech House")).toBe("Хаус");
    expect(mapGenre("Afrobeats")).toBe("Афро-хаус");
    expect(mapGenre("Hip-Hop")).toBe("Хип-хоп/Рэп");
    expect(mapGenre("Weird Genre")).toBe("Другое");
  });
  it("маппит массив жанров без дубликатов", () => {
    expect(mapGenres(["Pop", "Dance Pop"])).toEqual(["Поп"]);
  });
});
