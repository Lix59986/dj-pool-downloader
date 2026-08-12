/** Content script: кнопки «В избранное» и «Скачать» на страницах пулов. */

import { poolByDomain, type RawTrack } from "../lib/pools";

type AddFavoriteMsg = { type: "FAVORITE_ADD"; payload: RawTrack };
type DownloadMsg = { type: "DOWNLOAD"; payload: RawTrack };
type Message = AddFavoriteMsg | DownloadMsg;

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    .djp-host { display: inline-flex; align-items: center; gap: 2px;
      padding: 2px; margin: 0; line-height: 1; border-radius: 8px;
      background: rgba(255,255,255,0.85); box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
    .djp-btn { display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; padding: 0; border: none; border-radius: 6px;
      background: transparent; color: #57606a; cursor: pointer; font-size: 14px;
      line-height: 1; }
    .djp-btn:hover { background: rgba(0,0,0,0.06); }
    .djp-btn:active { transform: scale(0.92); }
    .djp-btn:disabled { opacity: 0.3; cursor: default; }
    .djp-btn.dl { color: #1f6feb; }
    .djp-btn.fav { color: #d4a72c; }
  `;
  document.documentElement.appendChild(style);
}

/** Извлечение id трека из URL страницы/карточки (общие паттерны пулов). */
function trackIdFromUrl(url: string): string | null {
  const m =
    url.match(/\/track(?:s)?\/(\d+)/) ??
    url.match(/track_id=(\d+)/) ??
    url.match(/[?&]id=(\d+)/) ??
    url.match(/\/tracks\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Эвристика по тексту карточки: bpm, тональность, части ночи, тип, рейтинг. */
function parseCardMeta(text: string): {
  bpm: number | null;
  key: string | null;
  parts: string[];
  pool_type: string | null;
  rating: number | null;
} {
  const bpmM = text.match(/(?:^|\s)(\d{2,3})\s*(?:bpm|бпм)/i);
  const bpm = bpmM ? Number(bpmM[1]) : null;

  let key: string | null = null;
  const keyM = text.match(/\b(\d{1,2}[AB])\b/i);
  if (keyM) {
    key = keyM[1].toUpperCase();
  } else {
    const m2 = text.match(/\b([A-G](?:#|b)?m)\b/i);
    if (m2) key = m2[1].toUpperCase();
  }

  const parts: string[] = [];
  const partRe = [
    /\bOpening\b/i,
    /\bPre[- ]Party\b/i,
    /\bPrimetime\b/i,
    /\bClosing\b/i,
    /\bAfterparty\b/i,
    /\bLate Night\b/i,
  ];
  for (const re of partRe) if (re.test(text)) parts.push(text.match(re)![0].replace(/\s+/g, " ").trim());

  const typeM = text.match(/\b(Intro Edit|Intro|Extended|Remix|Original|Clean|Dirty|Radio Edit|Club Mix)\b/i);
  const pool_type = typeM ? typeM[1] : null;

  const stars = (text.match(/★/g) ?? []).length;
  const rating = stars > 0 ? Math.min(stars, 5) : null;

  return { bpm, key, parts, pool_type, rating };
}

/** Извлечение RawTrack из DOM-карточки: data-атрибуты, затем текст карточки. */
function trackFromElement(el: Element, pool: string): RawTrack | null {
  const title =
    el.getAttribute("data-title") ??
    el.querySelector('[data-title]')?.getAttribute("data-title") ??
    "";
  let artist: string | null =
    el.getAttribute("data-artist") ??
    el.querySelector('[data-artist]')?.getAttribute("data-artist") ??
    null;
  const url =
    el.getAttribute("data-url") ??
    el.querySelector('[data-url]')?.getAttribute("data-url") ??
    (el.querySelector("a[href]")?.getAttribute("href") ?? null);
  const id =
    el.getAttribute("data-id") ??
    el.getAttribute("data-track-id") ??
    el.querySelector('[data-id]')?.getAttribute("data-id") ??
    el.querySelector('[data-track-id]')?.getAttribute("data-track-id") ??
    (url ? (trackIdFromUrl(url) ?? url) : "") ??
    (title ? String(Date.now()) : "");

  const absUrl = url ? new URL(url, location.href).href : null;

  const cardText = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const meta = parseCardMeta(cardText);

  // Fallback: текст карточки "Артист - Название" или только название
  let t = title;
  if (!t) {
    if (!cardText) return null;
    const m = cardText.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    t = m ? m[2].trim() : cardText;
    artist = m ? m[1].trim() : artist;
  }

  return {
    pool,
    track_id_on_pool: id || t,
    title: t.slice(0, 200),
    artist,
    artist_eff: "",
    bpm: meta.bpm,
    key: meta.key,
    genres: [],
    parts: meta.parts,
    rating: meta.rating,
    marks: [],
    pool_type: meta.pool_type,
    preview: false,
    duration_sec: null,
    url: absUrl,
  };
}

/** Поиск «родной» кнопки избранного/лайка рядом с карточкой (звёздочка, сердце, лайк). */
function findNativeFavoriteBtn(card: Element): Element | null {
  const selector = [
    "button[class*='fav']",
    "button[class*='like']",
    "button[class*='star']",
    "button[class*='bookmark']",
    "button[class*='save']",
    "[class*='fav'] button",
    "[class*='like'] button",
    "[class*='action'] button",
  ].join(",");
  // сначала внутри карточки, затем в ближайшем action-контейнере
  const inCard = card.querySelector(selector);
  if (inCard) return inCard;
  const near = card
    .closest("[class*='action'],[class*='controls'],[class*='buttons'],[class*='footer'],li,article")
    ?.querySelector(selector);
  if (near) return near;
  // fallback: любая кнопка с иконкой в последнем контейнере карточки
  const candidates = Array.from(card.querySelectorAll("button"));
  if (candidates.length > 0) return candidates[candidates.length - 1];
  return null;
}

/** Поиск «родной» кнопки/ссылки скачивания в карточке (для клика вместо нашего скачивания). */
function findNativeDownloadBtn(card: Element): HTMLElement | null {
  const isDownloadTrigger = (el: Element): boolean => {
    if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") return false;
    if (el instanceof HTMLAnchorElement) {
      const href = el.getAttribute("href") ?? "";
      if (!href) return true;
      try {
        const u = new URL(href, location.href);
        if (u.hostname === location.hostname && (u.pathname.includes("/track/") || u.pathname === location.pathname)) return false;
      } catch {
        return false;
      }
    }
    const t = (el.textContent ?? "").trim().toLowerCase();
    return /скачать|download|загруз|⤓/.test(t) || /(mp3|wav|flac|m4a|aac|ogg|opus)/.test(t);
  };
  const sel =
    "a[download], a[href*='.mp3'], a[href*='.wav'], a[href*='.flac'], a[href*='.m4a'], a[href*='.aac'], a[href*='.ogg'], a[href*='.opus'], a[href*='download'], button[class*='download'], button[class*='downl'], button[title*='Скачать'], button[title*='Download'], button[aria-label*='скачать'], button[aria-label*='download'], button[data-action*='download'], [class*='download'][role='button']";
  const direct = card.querySelector<HTMLElement>(sel);
  if (direct && isDownloadTrigger(direct)) {
    console.log(`[DJP] findNativeDownloadBtn: нашёл по селектору: ${direct.outerHTML.slice(0, 160)}`);
    return direct;
  }
  // текстовый fallback внутри карточки (кнопки/ссылки с фразами «Скачать»/«Download»/↓)
  const cand = Array.from(card.querySelectorAll<HTMLElement>("a,button,[role='button']")).find((el) => isDownloadTrigger(el));
  if (cand) console.log(`[DJP] findNativeDownloadBtn: нашёл по тексту: ${cand.outerHTML.slice(0, 160)}`);
  return cand ?? null;
}

/** Прямой аудио-URL из карточки: <a href=mp3>, <audio src>, кнопка/ссылка download. */
function findAudioUrl(card: Element): string | null {
  const link = card.querySelector(
    "a[href*='.mp3'],a[href*='.wav'],a[href*='.flac'],a[href*='.m4a'],a[href*='.aac'],a[href*='.ogg'],a[href*='.opus'],a[href*='audio'],a[href*='stream'],a[href*='download']",
  );
  if (link?.getAttribute("href")) return new URL(link.getAttribute("href")!, location.href).href;
  const audioEl = card.querySelector("audio[src]");
  if (audioEl?.getAttribute("src")) return new URL(audioEl.getAttribute("src")!, location.href).href;
  const elWithData = card.querySelector("[data-src],[data-url],[data-file],[data-audio],[data-mp3]");
  const attr = elWithData?.getAttribute("data-src") ?? elWithData?.getAttribute("data-url") ?? elWithData?.getAttribute("data-file") ?? elWithData?.getAttribute("data-audio") ?? elWithData?.getAttribute("data-mp3");
  if (attr) return new URL(attr, location.href).href;
  return null;
}

/** Повесить кнопки рядом с кнопкой избранного пула (или в конец карточки). */
function attachButtons(card: Element, pool: string): void {
  if (card.querySelector(".djp-host")) return;
  // уже вставлено в предке этой карточки (несколько якорей в одной карточке)
  if (card.closest(".djp-host")) return;
  card.classList.add("djp-card");
  const host = document.createElement("span");
  host.className = "djp-host";

  const favBtn = document.createElement("button");
  favBtn.className = "djp-btn fav";
  favBtn.title = "В избранное";
  favBtn.textContent = "☆";
  const dlBtn = document.createElement("button");
  dlBtn.className = "djp-btn dl";
  dlBtn.title = "Скачать";
  dlBtn.textContent = "↓";

  const run = async (type: Message["type"]) => {
    const raw = trackFromElement(card, pool);
    if (!raw) return;
    favBtn.disabled = dlBtn.disabled = true;
    try {
      if (type === "FAVORITE_ADD") {
        await chrome.runtime.sendMessage({ type, payload: raw } satisfies Message);
        favBtn.textContent = "★";
        favBtn.style.opacity = "1";
        favBtn.title = "Добавлено в избранное";
        return;
      }

      // Скачивание: сначала жмём штатную кнопку сайта (сайт даёт файл с нужной авторизацией,
      // а onDeterminingFilename положит его в muzz). Только если кнопки нет/выключена — через API.
      const nativeBtn = findNativeDownloadBtn(card);
      if (nativeBtn && !(nativeBtn instanceof HTMLButtonElement && nativeBtn.disabled)) {
        nativeBtn.click();
      } else {
        const audioUrl = findAudioUrl(card);
        if (audioUrl) raw.url = audioUrl;
        const resp = (await chrome.runtime.sendMessage({ type, payload: raw } satisfies Message)) as
          | { ok?: boolean; needClick?: boolean }
          | undefined;
        if (resp && resp.needClick) {
          const btn2 = findNativeDownloadBtn(card);
          if (btn2 && !(btn2 instanceof HTMLButtonElement && btn2.disabled)) btn2.click();
        }
      }
      dlBtn.textContent = "✓";
      setTimeout(() => {
        dlBtn.textContent = "↓";
      }, 1500);
    } finally {
      favBtn.disabled = dlBtn.disabled = false;
    }
  };

  favBtn.addEventListener("click", () => void run("FAVORITE_ADD"));
  dlBtn.addEventListener("click", () => void run("DOWNLOAD"));
  host.appendChild(favBtn);
  host.appendChild(dlBtn);

  const nativeBtn = findNativeFavoriteBtn(card);
  if (nativeBtn) {
    // вставляем сразу после родной кнопки
    nativeBtn.insertAdjacentElement("afterend", host);
  } else {
    card.appendChild(host);
  }
}

/** Служебные маршруты /tracks/*, которые не являются страницами треков. */
const TRACK_ACTION_ROUTES = ["/tracks/upload", "/tracks/pending", "/tracks/review", "/tracks/all", "/tracks/new"];

/** Общие карточки-кандидаты: элементы с data-title, ссылкой на трек, кнопкой play или текстом "Артист — Название". */
function candidateCards(root: ParentNode): Element[] {
  const sel = [
    "[data-title]",
    "[data-track]",
    "[data-track-id]",
    "a[href*='/track/']",
    "a[href*='/tracks/']",
    "a[href*='track_id=']",
    "a[href*='/play/']",
    "[class*='track-item']",
    "[class*='track_item']",
    "[class*='track-card']",
    "[class*='song-item']",
    "[class*='result-item']",
    "[class*='search-item']",
  ].join(",");
  const found = Array.from(root.querySelectorAll(sel));
  // поднимаемся до карточки (ближайший контейнер)
  const cards = new Set<Element>();
  for (const el of found) {
    // отсекаем служебные маршруты (навигация/загрузка), оставляем только страницы треков
    if (el instanceof HTMLAnchorElement) {
      const href = el.getAttribute("href") ?? "";
      if (TRACK_ACTION_ROUTES.some((r) => href === r || href.startsWith(r + "/") || href.startsWith(r + "?"))) continue;
    }
    const card = el.closest(
      [
        "[data-card]",
        "[data-track-card]",
        "li",
        "article",
        "tr",
        ".track",
        ".track-card",
        ".track-item",
        ".song",
        ".song-item",
        ".search-item",
        ".result-item",
        ".playlist-item",
        ".item",
        ".table-row",
        "[class*='row']",
        "[class*='card']",
        "[class*='Card']",
        "[class*='track']",
        "[class*='Track']",
        "[class*='item']",
        "[class*='Item']",
        "[role='listitem']",
        "[role='button']",
        "section",
      ].join(","),
    );
    if (card && card !== root) cards.add(card as Element);
  }
  // Запасной путь для SPA-пулов (36pool и т.п.): строка трека — кликабельный div
  // с play-контролем (<img alt="play"/"pause">, НЕ внутри <button> глобального плеера).
  if (cards.size === 0) {
    const plays = Array.from(root.querySelectorAll("img[alt='play'], img[alt='pause']")) as HTMLImageElement[];
    for (const img of plays) {
      if (img.closest("button")) continue;
      let el = img.parentElement;
      while (el && el !== root && el !== document.body) {
        const st = (el.getAttribute("style") ?? "").toLowerCase();
        if (st.includes("cursor:pointer") || st.includes("cursor: pointer")) {
          cards.add(el);
          break;
        }
        el = el.parentElement;
      }
    }
  }
  return Array.from(cards);
}

function scan(): void {
  const poolConnector = poolByDomain(location.hostname);
  if (!poolConnector) return;
  const cards = candidateCards(document);
  console.log(`[DJP] ${poolConnector.id}: найдено карточек: ${cards.length}`);
  for (const card of cards) attachButtons(card, poolConnector.id);
}

/** Кнопка скачивания на странице трека (клик по ней = загрузка файла сайта).
 * Точный выбор: ссылки на файл / кнопки «Скачать», без ссылок на текущую страницу. */
function findPageDownloadBtn(): HTMLElement | null {
  const isAudioTrigger = (el: Element): boolean => {
    if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") return false;
    if (el instanceof HTMLAnchorElement) {
      const href = el.getAttribute("href") ?? "";
      if (!href) return false;
      try {
        const u = new URL(href, location.href);
        if (u.hostname === location.hostname && (u.pathname.includes("/track/") || u.pathname === location.pathname)) return false;
      } catch {
        return false;
      }
    }
    return true;
  };

  const priority = document.querySelector<HTMLElement>(
    "a[download], a[href$='.mp3'], a[href$='.wav'], a[href$='.flac'], a[href$='.m4a'], a[href$='.aac'], a[href$='.ogg'], button[title*='Скачать'], button[title*='Download'], button[aria-label*='Скачать'], button[aria-label*='download'], button[class*='download']",
  );
  if (priority && isAudioTrigger(priority)) return priority;

  const any = Array.from(document.querySelectorAll<HTMLElement>("[class*='download'],[class*='downl']")).find(
    (el) => isAudioTrigger(el) && (el.tagName === "A" || el.tagName === "BUTTON"),
  );
  return any ?? null;
}

/** Токен jesteipool: cookie `token` (как ставит сайт), fallback localStorage/sessionStorage. */
function jesteiToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)token=([^;]*)/);
  if (m) return decodeURIComponent(m[1]);
  return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

/** Полный файл пула через сессию пользователя: API (с токеном) → play → CDN-URL.
 *  Возвращает null, если прямого аудио-URL не нашлось или это превью. */
async function sessionAudioUrl(raw: RawTrack, pool: string): Promise<string | null> {
  if (pool !== "jesteipool") return null;
  const queries: string[] = [];
  if (raw.artist) queries.push(raw.artist);
  if (raw.artist && raw.title) queries.push(`${raw.artist} ${raw.title}`);
  if (raw.title) queries.push(raw.title);
  if (!queries.length) return null;
  const token = jesteiToken();
  console.log(`[DJP] ${pool}: токен сессии: ${token ? "есть" : "НЕТ"}`);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization-Token"] = token;
  const bases = ["https://rest.jesteipool.com/api", "https://rest.jesteipool.ru/api"];
  try {
    for (const q of queries) {
      const eq = encodeURIComponent(q);
      let list: Array<{ id?: string; source?: string | null; preview_length?: number | null }> = [];
      let ok = false;
      for (const base of bases) {
        const res = await fetch(`${base}/search/tracks?q=${eq}&variant=all&limit=10`, {
          credentials: "include",
          headers,
        });
        if (!res.ok) {
          console.log(`[DJP] ${pool}: API search ${base} HTTP ${res.status}`);
          continue;
        }
        list = await res.json();
        ok = true;
        break;
      }
      if (!ok || !list.length) continue;
      const target =
        list.find((t) => String(t.id) === String(raw.track_id_on_pool)) ??
        list.find((t) => t.source) ??
        list[0];
      if (!target?.source) continue;
      console.log(`[DJP] ${pool}: сессионный source найден (${target.id}) по запросу "${q}"`);

      const playRes = await fetch(target.source, { credentials: "include", redirect: "follow", headers });
      const finalUrl = playRes.url;
      const ct = playRes.headers.get("content-type") ?? "";
      const cl = Number(playRes.headers.get("content-length") ?? "0");
      playRes.body?.cancel();
      if (!finalUrl) continue;
      if (!ct.startsWith("audio/")) {
        console.log(`[DJP] ${pool}: play вернул не аудио: ${ct}`);
        continue;
      }
      if (token) {
        // залогинен: требуем полный файл, превью (~1.4МБ) отсекаем → фоллбэк на клик
        if (cl > 0 && cl < 3_000_000) {
          console.log(`[DJP] ${pool}: похоже на превью (${cl} байт) — нужен логин`);
          continue;
        }
        console.log(`[DJP] ${pool}: полный файл: ${finalUrl} (${cl} байт)`);
      } else {
        // без логина отдаём что есть (превью) — попадёт в muzz/_preview
        console.log(`[DJP] ${pool}: без логина — превью: ${finalUrl} (${cl} байт)`);
      }
      return finalUrl;
    }
    return null;
  } catch (e) {
    console.log("[DJP] sessionAudioUrl error", e);
    return null;
  }
}

// Автозагрузка по просьбе background (из избранного): сначала прямой файл через сессию,
// затем клик по штатной кнопке скачивания страницы.
chrome.runtime.onMessage.addListener((msg: { type?: string; payload?: RawTrack }, _sender, sendResponse) => {
  if (msg?.type !== "AUTO_DOWNLOAD") return undefined;
  const raw = msg.payload;
  const pool = poolByDomain(location.hostname)?.id ?? "";
  void (async () => {
    if (raw) {
      const url = await sessionAudioUrl(raw, pool);
      if (url) {
        sendResponse({ ok: true, url });
        return;
      }
    }
    for (let i = 0; i < 10; i++) {
      const btn = findPageDownloadBtn();
      if (btn && !(btn instanceof HTMLButtonElement && btn.disabled)) {
        console.log(`[DJP] AUTO_DOWNLOAD: клик по: ${btn.outerHTML.slice(0, 200)}`);
        btn.click();
        sendResponse({ ok: true, needClick: true });
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    sendResponse({ ok: false });
  })();
  return true;
});

injectStyles();
console.log(`[DJP] content script на ${location.hostname}`);
scan();
// сайты пулов — SPA, следим за добавлением новых карточек
const observer = new MutationObserver(() => scan());
observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
