import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { DB } from "../lib/db";
import { getSettings, saveSettings, logout, isLoggedIn } from "../lib/storage";
import { apiLogin, apiRegister, apiDeleteFavorite, ApiError } from "../lib/api";
import { syncAll } from "../lib/sync";
import { generateRekordboxXml, generateM3U8 } from "../lib/rekordbox";
import { normalizeStr } from "../lib/normalize";
import type { Favorite, Layout, Part, Settings, Track } from "../lib/types";

type Tab = "tracks" | "favorites" | "settings";

function useTracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const reload = async () => setTracks(await DB.allTracks());
  useEffect(() => {
    void reload();
  }, []);
  return { tracks, reload };
}

function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const reload = async () => setFavorites(await DB.allFavorites());
  useEffect(() => {
    void reload();
  }, []);
  return { favorites, reload };
}

function App() {
  const [tab, setTab] = useState<Tab>("tracks");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const tracks = useTracks();
  const favorites = useFavorites();

  const refreshSettings = async () => setSettings(await getSettings());
  useEffect(() => {
    void refreshSettings();
  }, []);

  const notify = (type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const runSync = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const r = await syncAll(settings);
      await Promise.all([tracks.reload(), favorites.reload()]);
      notify("ok", `Синхронизировано: ↑${r.pushedFavorites + r.pushedTracks} ↓${r.pulledFavorites + r.pulledTracks}`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Ошибка синхронизации");
    } finally {
      setBusy(false);
    }
  };

  const downloadXml = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const xml = generateRekordboxXml(tracks.tracks, settings.downloadFolder || "C:/Users/Загрузки");
      await chromeDownload("muzz/rekordbox - muzz.xml", xml, "text/xml");
      notify("ok", "Rekordbox XML скачан");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setBusy(false);
    }
  };

  const downloadM3u8 = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const files = generateM3U8(tracks.tracks, settings.downloadFolder || "C:/Users/Загрузки");
      for (const [name, content] of files) {
        await chromeDownload(`muzz/${name}`, content, "audio/x-mpegurl");
      }
      notify("ok", `M3U8 скачан (${files.size} плейлистов)`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return <div className="content muted">Загрузка…</div>;

  return (
    <>
      <header>
        <h1>DJ Pool Downloader</h1>
        <span className="badge">{tracks.tracks.length} тр.</span>
        <span className="badge">{settings.user ? settings.user.email : "нет входа"}</span>
      </header>
      <div className="tabs">
        <button className={tab === "tracks" ? "active" : ""} onClick={() => setTab("tracks")}>Скачивания</button>
        <button className={tab === "favorites" ? "active" : ""} onClick={() => setTab("favorites")}>Избранное</button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Настройки</button>
      </div>
      <div className="content">
        {msg && <div className={msg.type === "ok" ? "ok-msg" : "err-msg"}>{msg.text}</div>}
        {tab === "tracks" && <TracksTab tracks={tracks.tracks} reload={tracks.reload} notify={notify} />}
        {tab === "favorites" && (
          <FavoritesTab favorites={favorites.favorites} settings={settings} reload={favorites.reload} notify={notify} />
        )}
        {tab === "settings" && (
          <SettingsTab
            settings={settings}
            onSettingsChange={(s) => setSettings(s)}
            notify={notify}
            busy={busy}
            onSync={runSync}
            onXml={downloadXml}
            onM3u8={downloadM3u8}
          />
        )}
      </div>
    </>
  );
}

function chromeDownload(filename: string, content: string, mime: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    chrome.downloads.download({ url, filename, conflictAction: "overwrite" }, (id) => {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

/* ---------- Вкладка «Скачивания» ---------- */

function TracksTab({ tracks, reload, notify }: { tracks: Track[]; reload: () => void; notify: (t: "ok" | "err", s: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeStr(query);
    if (!q) return tracks;
    return tracks.filter((t) => normalizeStr(`${t.artist ?? ""} ${t.title}`).includes(q));
  }, [tracks, query]);

  return (
    <div>
      <input placeholder="Поиск…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {filtered.length === 0 && <div className="empty">Треков пока нет — скачайте музыку с пула</div>}
      {filtered.map((t) =>
        editing === t.id ? (
          <TrackEditor key={t.id} track={t} onClose={() => setEditing(null)} reload={reload} notify={notify} />
        ) : (
          <TrackRow key={t.id} track={t} onEdit={() => setEditing(t.id)} onDelete={async () => { await DB.deleteTrack(t.id); await reload(); notify("ok", "Удалено"); }} />
        ),
      )}
    </div>
  );
}

function TrackRow({ track, onEdit, onDelete }: { track: Track; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="row">
      <div className="meta">
        <div className="title">
          {track.artist ? `${track.artist} — ` : ""}{track.title}
          {track.preview && <span className="tag">превью</span>}
        </div>
        <div className="sub">
          {(track.parts ?? []).map((p) => <span key={p} className="tag">{p}</span>)}
          <span className="tag">{track.lang}</span>
          {track.rating ? <span className="tag star">★{track.rating}</span> : null}
          {(track.genres ?? []).map((g) => <span key={g} className="tag">{g}</span>)}
          {(track.marks ?? []).map((m) => <span key={m} className="tag">{m}</span>)}
          {track.bpm ? <span className="tag">{track.bpm} BPM</span> : null}
          {track.key ? <span className="tag">{track.key}</span> : null}
        </div>
        {track.comment && <div className="comment">{track.comment}</div>}
      </div>
      <div className="inline-actions">
        <button className="icon-btn" title="Изменить" onClick={onEdit}>✎</button>
        <button className="icon-btn" title="Удалить" onClick={onDelete}>✕</button>
      </div>
    </div>
  );
}

function TrackEditor({ track, onClose, reload, notify }: { track: Track; onClose: () => void; reload: () => void; notify: (t: "ok" | "err", s: string) => void }) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist ?? "");
  const [parts, setParts] = useState<Part[]>(track.parts);
  const [genres, setGenres] = useState<string>(track.genres.join(", "));
  const [marks, setMarks] = useState<string>(track.marks.join(", "));
  const [comment, setComment] = useState(track.comment ?? "");
  const [rating, setRating] = useState(track.rating ?? 0);

  const togglePart = (p: Part) => setParts((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    if (!title.trim()) { notify("err", "Название не может быть пустым"); return; }
    await DB.updateTrack(track.id, {
      title: title.trim(),
      artist: artist.trim() || null,
      parts,
      genres: splitList(genres),
      marks: splitList(marks),
      comment: comment.trim() || null,
      rating: rating || null,
    });
    onClose();
    await reload();
    notify("ok", "Трек обновлён");
  };

  return (
    <div className="edit">
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label>Артист</label>
        <input value={artist} onChange={(e) => setArtist(e.target.value)} />
        <label>Название</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Часть ночи (несколько — трек в каждой)</label>
        <div className="form-row">
          {(["Open", "Primetime", "Close"] as Part[]).map((p) => (
            <button key={p} type="button" className={`btn ${parts.includes(p) ? "primary" : ""}`} onClick={() => togglePart(p)}>{p}</button>
          ))}
        </div>
        <label>Жанры (через запятую)</label>
        <input value={genres} onChange={(e) => setGenres(e.target.value)} />
        <label>Маркировки (через запятую)</label>
        <input value={marks} onChange={(e) => setMarks(e.target.value)} />
        <label>Комментарий</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        <label>Рейтинг (1–5)</label>
        <input type="number" min={0} max={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} />
        <div className="form-row">
          <button type="submit" className="btn primary">Сохранить</button>
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Вкладка «Избранное» ---------- */

function FavoritesTab({ favorites, settings, reload, notify }: { favorites: Favorite[]; settings: Settings; reload: () => void; notify: (t: "ok" | "err", s: string) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const remove = async (fav: Favorite) => {
    await DB.removeFavorite(fav.id);
    if (fav.synced && settings.token) {
      try {
        await apiDeleteFavorite(settings.backendUrl, settings.token, fav.id);
      } catch { /* локально всё равно удалили */ }
    }
    await reload();
    notify("ok", "Удалено из избранного");
  };

  const toggle = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadFav = async (fav: Favorite) => {
    // Обогащаем метаданные и скачиваем через background (прямой аудио-URL или fallback)
    const resp = (await chrome.runtime.sendMessage({
      type: "FAVORITE_DOWNLOAD",
      payload: {
        pool: fav.pool,
        track_id_on_pool: fav.track_id_on_pool,
        title: fav.title,
        artist: fav.artist,
        bpm: fav.meta?.bpm,
        key: fav.meta?.key,
        genres: fav.meta?.genres,
        parts: fav.meta?.parts,
        rating: fav.meta?.rating,
        marks: fav.meta?.marks,
        url: fav.url,
      },
    })) as { ok?: boolean } | undefined;
    if (!resp?.ok) return false;
    await DB.addFavorite({ ...fav, status: "done" });
    return true;
  };

  const downloadMany = async (list: Favorite[]) => {
    setBusy(true);
    let ok = 0;
    try {
      for (const f of list) if (await downloadFav(f)) ok++;
      await reload();
      notify("ok", `Скачивание запущено: ${ok}/${list.length}`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Ошибка скачивания");
    } finally {
      setBusy(false);
    }
  };

  if (favorites.length === 0) return <div className="empty">Избранного пока нет</div>;
  return (
    <div>
      <div className="form-row" style={{ marginBottom: 6 }}>
        <button className="btn" disabled={busy} onClick={() => void downloadMany(favorites.filter((f) => selected.has(f.id)))}>
          Скачать выбранные ({selected.size})
        </button>
        <button className="btn" disabled={busy} onClick={() => void downloadMany(favorites)}>
          Скачать все
        </button>
      </div>
      {favorites.map((f) => (
        <div className="row" key={f.id}>
          <input
            type="checkbox"
            checked={selected.has(f.id)}
            onChange={() => toggle(f.id)}
            style={{ width: "auto" }}
          />
          <div className="meta">
            <div className="title">{f.artist ? `${f.artist} — ` : ""}{f.title}</div>
            <div className="sub">
              <span className="tag">{f.pool}</span>
              {(f.meta?.parts ?? []).map((p) => <span key={p} className="tag">{p}</span>)}
              {(f.meta?.genres ?? []).map((g) => <span key={g} className="tag">{g}</span>)}
              {(f.meta?.marks ?? []).map((m) => <span key={m} className="tag">{m}</span>)}
              {f.meta?.bpm ? <span className="tag">{f.meta.bpm} BPM</span> : null}
              {f.meta?.key ? <span className="tag">{f.meta.key}</span> : null}
              {f.meta?.rating ? <span className="tag star">★{f.meta.rating}</span> : null}
              {f.status !== "new" && <span className="tag">{f.status}</span>}
            </div>
            {f.meta?.comment && <div className="comment">{f.meta.comment}</div>}
          </div>
          <button className="icon-btn" title="Удалить" onClick={() => void remove(f)}>✕</button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Вкладка «Настройки» ---------- */

function SettingsTab(props: {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  notify: (t: "ok" | "err", s: string) => void;
  busy: boolean;
  onSync: () => void;
  onXml: () => void;
  onM3u8: () => void;
}) {
  const { settings, onSettingsChange } = props;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  const loggedIn = isLoggedIn(settings);

  const login = async () => {
    try {
      const resp = await apiLogin(settings.backendUrl, email, password);
      await saveSettings({ token: resp.session.access_token, user: { id: resp.user.id, email: resp.user.email } });
      onSettingsChange(await getSettings());
      props.notify("ok", "Вход выполнен");
    } catch (e) {
      props.notify("err", e instanceof ApiError ? e.message : "Ошибка входа");
    }
  };

  const register = async () => {
    try {
      const resp = await apiRegister(settings.backendUrl, email, password, invite);
      await saveSettings({ token: resp.session.access_token, user: { id: resp.user.id, email: resp.user.email } });
      onSettingsChange(await getSettings());
      props.notify("ok", "Регистрация успешна");
    } catch (e) {
      props.notify("err", e instanceof ApiError ? e.message : "Ошибка регистрации");
    }
  };

  const patch = async (p: Partial<Settings>) => {
    const next = await saveSettings(p);
    onSettingsChange(next);
  };

  return (
    <div>
      {!loggedIn && (
        <div className="section">
          <h3>Вход</h3>
          <div className="form-row">
            <button className={`btn ${mode === "login" ? "primary" : ""}`} onClick={() => setMode("login")}>Вход</button>
            <button className={`btn ${mode === "register" ? "primary" : ""}`} onClick={() => setMode("register")}>Регистрация</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); mode === "login" ? void login() : void register(); }}>
            <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input placeholder="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === "register" && <input placeholder="Инвайт-код" value={invite} onChange={(e) => setInvite(e.target.value)} />}
            <button className="btn primary" type="submit">{mode === "login" ? "Войти" : "Зарегистрироваться"}</button>
          </form>
        </div>
      )}

      {loggedIn && (
        <div className="section">
          <h3>Аккаунт</h3>
          <div className="row">
            <span className="meta">{settings.user?.email}</span>
            <button className="btn" onClick={async () => { await logout(); onSettingsChange(await getSettings()); }}>Выйти</button>
          </div>
        </div>
      )}

      <div className="section">
        <h3>Папка загрузок</h3>
        <input
          placeholder="C:/Users/…/Downloads"
          value={settings.downloadFolder}
          onChange={(e) => void patch({ downloadFolder: e.target.value })}
        />
        <div className="hint">Абсолютный путь до папки загрузок — для XML/M3U8</div>
      </div>

      <div className="section">
        <h3>Раскладка папки muzz</h3>
        <select value={settings.layout} onChange={(e) => void patch({ layout: e.target.value as Layout })}>
          <option value="night">Часть ночи / Артист</option>
          <option value="artist">Артист / Часть ночи</option>
          <option value="genre">Жанр / Часть ночи</option>
          <option value="flat">Плоская</option>
          <option value="custom">Свой шаблон</option>
        </select>
        {settings.layout === "custom" && (
          <input
            placeholder="muzz/{Жанр}/{Часть ночи}/{Артист} - {Название}.{ext}"
            value={settings.template}
            onChange={(e) => void patch({ template: e.target.value })}
          />
        )}
      </div>

      <div className="section">
        <h3>Экспорт</h3>
        <div className="form-row">
          <button className="btn" disabled={props.busy} onClick={props.onXml}>Скачать XML</button>
          <button className="btn" disabled={props.busy} onClick={props.onM3u8}>Скачать M3U8</button>
          <button className="btn primary" disabled={props.busy || !loggedIn} onClick={props.onSync}>
            {props.busy ? "…" : "Синхронизировать"}
          </button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
