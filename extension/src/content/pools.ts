/** Content script: кнопки «В избранное» и «Скачать» на страницах пулов. */

import { poolByDomain, type RawTrack } from "../lib/pools";

type AddFavoriteMsg = { type: "FAVORITE_ADD"; payload: RawTrack };
type DownloadMsg = { type: "DOWNLOAD"; payload: RawTrack };
type Message = AddFavoriteMsg | DownloadMsg;

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    .djp-btn { margin: 4px 4px 4px 0; padding: 4px 10px; border: 1px solid #d0d7de;
      border-radius: 6px; background: #fff; color: #1f2328; cursor: pointer;
      font-size: 12px; line-height: 1.4; }
    .djp-btn:hover { background: #f6f8fa; }
    .djp-btn.primary { background: #1f6feb; color: #fff; border-color: #1f6feb; }
    .djp-btn.primary:hover { opacity: 0.9; }
    .djp-btn:disabled { opacity: 0.5; cursor: default; }
    .djp-host { display: inline-flex; gap: 4px; }
  `;
  document.documentElement.appendChild(style);
}

/** Извлечение RawTrack из DOM-карточки: data-атрибуты, затем текст "Артист - Название". */
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
    el.querySelector('[data-id]')?.getAttribute("data-id") ??
    (url ?? title);

  // Fallback: текст карточки "Артист - Название" или только название
  if (!title) {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const m = text.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    const t = m ? m[2].trim() : text;
    artist = m ? m[1].trim() : artist;
    return {
      pool,
      track_id_on_pool: id || t,
      title: t.slice(0, 200),
      artist,
      artist_eff: "",
      bpm: null,
      key: null,
      genres: [],
      parts: [],
      rating: null,
      marks: [],
      pool_type: null,
      preview: false,
      duration_sec: null,
      url: url ? new URL(url, location.href).href : null,
    };
  }

  return {
    pool,
    track_id_on_pool: id,
    title,
    artist,
    artist_eff: "",
    bpm: null,
    key: null,
    genres: [],
    parts: [],
    rating: null,
    marks: [],
    pool_type: null,
    preview: false,
    duration_sec: null,
    url: url ? new URL(url, location.href).href : null,
  };
}

/** Повесить кнопки на карточку. */
function attachButtons(card: Element, pool: string): void {
  if (card.querySelector(".djp-host")) return;
  const host = document.createElement("span");
  host.className = "djp-host";

  const favBtn = document.createElement("button");
  favBtn.className = "djp-btn";
  favBtn.textContent = "⭐ В избранное";
  const dlBtn = document.createElement("button");
  dlBtn.className = "djp-btn primary";
  dlBtn.textContent = "Скачать";

  const run = async (type: Message["type"]) => {
    const raw = trackFromElement(card, pool);
    if (!raw) return;
    favBtn.disabled = dlBtn.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type, payload: raw } satisfies Message);
    } finally {
      favBtn.disabled = dlBtn.disabled = false;
    }
  };

  favBtn.addEventListener("click", () => void run("FAVORITE_ADD"));
  dlBtn.addEventListener("click", () => void run("DOWNLOAD"));
  host.appendChild(favBtn);
  host.appendChild(dlBtn);
  card.appendChild(host);
}

/** Общие карточки-кандидаты: элементы с data-title или ссылкой на трек. */
function candidateCards(root: ParentNode): Element[] {
  const sel = [
    "[data-title]",
    "[data-track]",
    "a[href*='/track/']",
    "a[href*='/tracks/']",
    "a[href*='track_id=']",
  ].join(",");
  const found = Array.from(root.querySelectorAll(sel));
  // поднимаемся до карточки (ближайший контейнер)
  const cards = new Set<Element>();
  for (const el of found) {
    const card = el.closest(
      "[data-card],[data-track-card],li,article,.track,.track-card,.song,.search-item,.result-item",
    );
    if (card && card !== root) cards.add(card as Element);
  }
  return Array.from(cards);
}

function scan(): void {
  const poolConnector = poolByDomain(location.hostname);
  if (!poolConnector) return;
  for (const card of candidateCards(document)) attachButtons(card, poolConnector.id);
}

injectStyles();
scan();
// сайты пулов — SPA, следим за добавлением новых карточек
const observer = new MutationObserver(() => scan());
observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
