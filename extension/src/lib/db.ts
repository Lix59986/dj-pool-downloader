/** Локальная база (IndexedDB): store tracks, favorites, settings. */

import type { Track, Favorite, Settings } from "./types";

const DB_NAME = "dj-pool-downloader";
const DB_VERSION = 1;

type StoreName = "tracks" | "favorites" | "settings";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("tracks")) {
        const s = db.createObjectStore("tracks", { keyPath: "id" });
        s.createIndex("artist_title", ["artist_eff", "title"], { unique: true });
        s.createIndex("pool", "pool");
      }
      if (!db.objectStoreNames.contains("favorites")) {
        const s = db.createObjectStore("favorites", { keyPath: "id" });
        s.createIndex("pool_track", ["pool", "track_id_on_pool"], { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result: T | undefined;
    const req = fn(s);
    if (req) {
      req.onsuccess = () => {
        result = req.result as T;
      };
    }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function getAll<T>(db: IDBDatabase, store: StoreName): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, "readonly");
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function clear(db: IDBDatabase, store: StoreName): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    t.objectStore(store).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** Проверка дубликата по artist_eff+title. */
export function findDuplicate(
  db: IDBDatabase,
  artistEff: string,
  title: string,
): Promise<Track | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction("tracks", "readonly");
    const idx = t.objectStore("tracks").index("artist_title");
    const req = idx.getKey([artistEff, title]);
    req.onsuccess = () => resolve(req.result as Track | undefined);
    req.onerror = () => reject(req.error);
  });
}

export class DB {
  private static _db: Promise<IDBDatabase> | null = null;

  static get(): Promise<IDBDatabase> {
    if (!DB._db) DB._db = openDB();
    return DB._db;
  }

  static async addTrack(track: Track): Promise<void> {
    const db = await DB.get();
    await tx(db, "tracks", "readwrite", (s) => s.put(track));
  }

  static async updateTrack(id: string, patch: Partial<Track>): Promise<void> {
    const db = await DB.get();
    const all = await getAll<Track>(db, "tracks");
    const found = all.find((t) => t.id === id);
    if (found) await tx(db, "tracks", "readwrite", (s) => s.put({ ...found, ...patch }));
  }

  static async deleteTrack(id: string): Promise<void> {
    const db = await DB.get();
    await tx(db, "tracks", "readwrite", (s) => s.delete(id));
  }

  static async allTracks(): Promise<Track[]> {
    const db = await DB.get();
    return getAll<Track>(db, "tracks");
  }

  static async unsyncedTracks(): Promise<Track[]> {
    const all = await DB.allTracks();
    return all.filter((t) => !t.synced);
  }

  static async clearTracks(): Promise<void> {
    const db = await DB.get();
    await clear(db, "tracks");
  }

  static async addFavorite(fav: Favorite): Promise<void> {
    const db = await DB.get();
    await tx(db, "favorites", "readwrite", (s) => s.put(fav));
  }

  static async allFavorites(): Promise<Favorite[]> {
    const db = await DB.get();
    return getAll<Favorite>(db, "favorites");
  }

  static async removeFavorite(id: string): Promise<void> {
    const db = await DB.get();
    await tx(db, "favorites", "readwrite", (s) => s.delete(id));
  }

  static async unsyncedFavorites(): Promise<Favorite[]> {
    const all = await DB.allFavorites();
    return all.filter((f) => !f.synced);
  }

  static async setSetting(key: string, value: string): Promise<void> {
    const db = await DB.get();
    await tx(db, "settings", "readwrite", (s) => s.put({ key, value }));
  }

  static async getSetting(key: string): Promise<string | null> {
    const db = await DB.get();
    const row = await tx<{ key: string; value: string }>(db, "settings", "readonly", (s) => s.get(key));
    return row?.value ?? null;
  }
}
