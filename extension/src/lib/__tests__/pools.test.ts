import { describe, it, expect } from "vitest";
import { poolById, keywordsFromTrack } from "../pools";
import jesteipoolFixture from "../../../../fixtures/jesteipool.json";
import muzvizorFixture from "../../../../fixtures/muzvizor.json";
import pool36Fixture from "../../../../fixtures/36pool.json";

describe("jesteipool connector", () => {
  const connector = poolById("jesteipool")!;
  it("маппит фикстуру: название, артист, ключ Camelot, жанры, части ночи", () => {
    const [t] = connector.parseResponse([jesteipoolFixture]);
    expect(t.title).toBe("Candy Shop (Lilian Bilotta Remix)");
    expect(t.artist).toBe("50 Cent, Olivia");
    expect(t.artist_eff).toBe("50 cent; olivia");
    expect(t.bpm).toBe(130);
    expect(t.key).toBe("5B");
    expect(t.genres).toContain("Поп");
    expect(t.genres).toContain("Хаус");
    expect(t.parts).toContain("Primetime");
    expect(t.parts).toContain("Closing");
    expect(t.marks).toContain("Рэтоп");
    expect(t.marks).toContain("Танцевальный");
    expect(t.rating).toBe(1);
    expect(t.pool_type).toBe("Remix");
    expect(t.duration_sec).toBe(181);
  });
  it("части ночи из строки с несколькими метками разделяются", () => {
    const [t] = connector.parseResponse([jesteipoolFixture]);
    expect(t.parts).toEqual(["Primetime", "Closing"]);
  });
  it("маркировки: объект или массив объектов {title} → массив названий", () => {
    const [t] = connector.parseResponse([jesteipoolFixture]);
    const track = connector.toTrack(t);
    expect(track.marks).toEqual(["Рэтоп", "Танцевальный"]);
    expect(track.parts).toEqual(["Primetime", "Close"]);
  });
  it("favorite содержит метаданные и комментарий", () => {
    const [t] = connector.parseResponse([jesteipoolFixture]);
    const fav = connector.toFavorite(t);
    expect(fav.pool).toBe("jesteipool");
    expect(fav.track_id_on_pool).toBe("328149");
    expect(fav.meta?.parts).toEqual(["Primetime", "Close"]);
    expect(fav.meta?.key).toBe("5B");
    expect(fav.meta?.marks).toEqual(["Рэтоп", "Танцевальный"]);
    expect(fav.meta?.comment).toContain("JP часть ночи");
    expect(fav.meta?.comment).toContain("Маркировки: Рэтоп, Танцевальный");
  });
  it("toTrack заполняет comment в БД", () => {
    const [t] = connector.parseResponse([jesteipoolFixture]);
    const track = connector.toTrack(t);
    expect(track.comment).toContain("JP жанры: Поп, Хаус");
    expect(track.comment).toContain("Тип: Remix");
  });
});

describe("muzvizor connector", () => {
  const connector = poolById("muzvizor")!;
  it("маппит фикстуру: язык, stage→Open, превью по download=false", () => {
    const [t] = connector.parseResponse({ tracks: [muzvizorFixture] });
    expect(t.title).toBe("Do You Think About Me (Rob Rivera Transition 126-94 Extended)");
    expect(t.artist).toBe("50 Cent, Governor");
    expect(t.bpm).toBe(94);
    expect(t.key).toBe("4A");
    expect(t.genres).toContain("Хип-хоп/Рэп");
    expect(t.parts).toContain("warmup");
    expect(t.preview).toBe(true);
  });
  it("toTrack классифицирует parts по маппингу", () => {
    const [t] = connector.parseResponse({ tracks: [muzvizorFixture] });
    const track = connector.toTrack(t);
    expect(track.parts).toEqual(["Open"]);
    expect(track.lang).toBe("Foreign");
  });
});

describe("36pool connector", () => {
  const connector = poolById("36pool")!;
  it("маппит фикстуру: артист из artist.name, ключ нотация→Camelot, night_time", () => {
    const [t] = connector.parseResponse([pool36Fixture]);
    expect(t.title).toBe("I Get It In");
    expect(t.artist).toBe("50 Cent");
    expect(t.artist_eff).toBe("50 cent");
    expect(t.bpm).toBe(95);
    expect(t.key).toBe("C#m");
    expect(t.genres).toContain("Хип-хоп/Рэп");
    expect(t.parts).toContain("Pre-Party");
    expect(t.pool_type).toBe("Original");
    expect(t.duration_sec).toBe(192);
  });
  it("toTrack конвертирует key в Camelot и part в Open", () => {
    const [t] = connector.parseResponse([pool36Fixture]);
    const track = connector.toTrack(t);
    expect(track.parts).toEqual(["Open"]);
    expect(track.key).toBe("C#m");
  });
});

describe("keywordsFromTrack", () => {
  it("составляет запрос из артиста и названия", () => {
    expect(keywordsFromTrack("In Da Club", "50 Cent")).toBe("50 Cent In Da Club");
    expect(keywordsFromTrack("Candy Shop (Lilian Bilotta Remix)", "50 Cent")).toBe("50 Cent Candy Shop");
  });
});
