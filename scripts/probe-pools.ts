/**
 * Этап 0 — проверка API трёх основных пулов (smoke-тест).
 * Запуск: npm run probe
 *
 * Для каждого пула выполняет поисковый запрос, выводит первые записи
 * (все поля) и сохраняет фикстуры в fixtures/ для юнит-тестов этапа 2c.
 * Фикстуры обезличены: без кук, токенов и подписанных playback_url.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** Базовая строка поиска (проверено: работает на всех трёх пулах). */
const QUERY = "50 Cent";

interface ProbeResult {
  pool: string;
  httpStatus: number;
  ok: boolean;
  error?: string;
  count?: number;
  keys?: string[]; // ключи первого объекта
  sample?: unknown; // первый объект (обрезанный soundwave)
}

/** Получение поля как объекта (для genres — массив объектов). */
function probe(pool: string, url: string, headers: Record<string, string>): Promise<ProbeResult> {
  return fetch(url, { headers })
    .then(async (r) => {
      const text = await r.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        return {
          pool,
          httpStatus: r.status,
          ok: false,
          error: `Ответ не является JSON: ${text.slice(0, 200)}`,
        } satisfies ProbeResult;
      }

      // Нормализуем ответ: jesteipool и 36pool — массив, muzvizor — {tracks: []}.
      const arr: unknown[] = Array.isArray(json)
        ? json
        : Array.isArray((json as { tracks?: unknown[] } | null)?.tracks)
          ? ((json as { tracks: unknown[] }).tracks)
          : [];

      const first = arr[0] as Record<string, unknown> | undefined;
      return {
        pool,
        httpStatus: r.status,
        ok: r.ok,
        count: arr.length,
        keys: first ? Object.keys(first) : [],
        sample: first,
      } satisfies ProbeResult;
    })
    .catch((e: unknown) => ({
      pool,
      httpStatus: 0,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }));
}

/** Обезличивание фикстуры jesteipool: убрать звуковую волну и токены source. */
function sanitizeJesteipool(t: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...t };
  copy.soundwave = [];
  if (typeof copy.source === "string") copy.source = copy.source.split("&key=")[0];
  if (Array.isArray(copy.downloads)) {
    copy.downloads = (copy.downloads as Record<string, unknown>[]).map((d) => {
      if (typeof d.source === "string") d.source = d.source.split("&key=")[0];
      return d;
    });
  }
  return copy;
}

/** Обезличивание фикстуры muzvizor: убрать audio_id. */
function sanitizeMuzvizor(t: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...t };
  if (Array.isArray(copy.audios)) {
    copy.audios = (copy.audios as Record<string, unknown>[]).map((a) => {
      const c = { ...a };
      delete c.audio_id;
      return c;
    });
  }
  return copy;
}

/** Обезличивание фикстуры 36pool: убрать playback_url и служебные поля владельца. */
function sanitize36pool(t: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...t };
  delete copy.playback_url;
  if (copy.owner && typeof copy.owner === "object") {
    const o = copy.owner as Record<string, unknown>;
    copy.owner = { id: o.id, username: o.username, role: o.role };
  }
  return copy;
}

async function run() {
  const results: ProbeResult[] = [];
  const fixtures: Record<string, unknown> = {};

  // 1. jesteipool.ru
  const jesteipool = await probe(
    "jesteipool",
    `https://rest.jesteipool.ru/api/search/tracks?q=${encodeURIComponent(QUERY)}&variant=all&limit=2`,
    { Accept: "application/json" },
  );
  if (jesteipool.sample) fixtures.jesteipool = sanitizeJesteipool(jesteipool.sample as Record<string, unknown>);
  results.push(jesteipool);

  // 2. muzvizor.com
  const muzvizor = await probe(
    "muzvizor",
    `https://muzvizor.com/api/v1/tracks/?query=${encodeURIComponent(QUERY)}`,
    { Accept: "application/json" },
  );
  if (muzvizor.sample) fixtures.muzvizor = sanitizeMuzvizor(muzvizor.sample as Record<string, unknown>);
  results.push(muzvizor);

  // 3. 36pool.com
  const pool36 = await probe(
    "36pool",
    `https://36pool.com/api/v1/tracks/search?query=${encodeURIComponent(QUERY)}`,
    {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
      Referer: "https://36pool.com/",
    },
  );
  if (pool36.sample) fixtures["36pool"] = sanitize36pool(pool36.sample as Record<string, unknown>);
  results.push(pool36);

  // Вывод отчёта
  for (const r of results) {
    console.log(`\n=== ${r.pool} === HTTP ${r.httpStatus} ${r.ok ? "OK" : "FAIL"}`);
    if (r.error) {
      console.log("ОШИБКА:", r.error);
      continue;
    }
    console.log("Найдено треков:", r.count);
    console.log("Ключи первого объекта:");
    for (const k of r.keys ?? []) console.log("  -", k);
    if (r.sample) console.log("Пример:", JSON.stringify(r.sample, null, 2).slice(0, 2000));
  }

  // Сохранение фикстур
  mkdirSync(join(process.cwd(), "fixtures"), { recursive: true });
  for (const [name, data] of Object.entries(fixtures)) {
    const file = join(process.cwd(), "fixtures", `${name}.json`);
    writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
    console.log(`\nСохранено: ${file}`);
  }

  const failed = results.filter((r) => !r.ok || r.httpStatus !== 200);
  if (failed.length > 0) {
    console.log(`\nИТОГО: ${failed.length} пул(а) не прошло проверку.`);
    process.exitCode = 1;
  } else {
    console.log("\nИТОГО: все 3 пула отвечают, фикстуры сохранены.");
  }
}

run();
