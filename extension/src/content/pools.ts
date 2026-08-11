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
  const direct = card.querySelector<HTMLElement>(
    "a[download], a[href*='.mp3'], a[href*='.wav'], a[href*='.flac'], a[href*='.m4a'], a[href*='.aac'], a[href*='.ogg'], a[href*='.opus'], a[href*='download'], button[class*='download'], button[class*='downl'], button[title*='Скачать'], button[title*='Download'], button[aria-label*='download'], button[aria-label*='Скачать']",
  );
  if (direct) return direct;
  // fallback: кликабельный элемент с классом download
  const any = card.querySelector<HTMLElement>("[class*='download']");
  if (any && (any.tagName === "A" || any.tagName === "BUTTON")) return any;
  return null;
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
    "[class*='play']",
    "[class*='actions']",
  ].join(",");
  const found = Array.from(root.querySelectorAll(sel));
  // поднимаемся до карточки (ближайший контейнер)
  const cards = new Set<Element>();
  for (const el of found) {
    const card = el.closest(
      "[data-card],[data-track-card],li,article,tr,.track,.track-card,.track-item,.song,.song-item,.search-item,.result-item,.playlist-item,.item,.table-row,[class*='row']",
    );
    if (card && card !== root) cards.add(card as Element);
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

/** Кнопка скачивания на странице трека (клик по ней = загрузка файла сайта). */
function findPageDownloadBtn(): HTMLElement | null {
  const direct = document.querySelector<HTMLElement>(
    "a[download], button[class*='download'], button[class*='downl'], button[title*='Скачать'], button[title*='Download'], button[aria-label*='download'], button[aria-label*='Скачать'], [class*='download'][role='button']",
  );
  if (direct) return direct;
  const any = document.querySelector<HTMLElement>("[class*='download']");
  if (any && (any.tagName === "A" || any.tagName === "BUTTON")) return any;
  return null;
}

// Автозагрузка по просьбе background (из избранного): кликаем штатную кнопку скачивания страницы.
chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse) => {
  if (msg?.type !== "AUTO_DOWNLOAD") return undefined;
  const tryClick = async () => {
    for (let i = 0; i < 10; i++) {
      const btn = findPageDownloadBtn();
      if (btn && !(btn instanceof HTMLButtonElement && btn.disabled)) {
        btn.click();
        return true;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };
  void tryClick().then(sendResponse);
  return true;
});

injectStyles();
console.log(`[DJP] content script на ${location.hostname}`);
scan();
// сайты пулов — SPA, следим за добавлением новых карточек
const observer = new MutationObserver(() => scan());
observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
