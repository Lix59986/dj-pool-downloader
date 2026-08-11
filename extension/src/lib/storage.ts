/** Настройки расширения (chrome.storage.local) и логика вход/выход. */

import { DEFAULT_SETTINGS, type Settings } from "./types";

const KEY = "settings";

export async function getSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(data[KEY] ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function isLoggedIn(settings: Settings): boolean {
  return Boolean(settings.token && settings.user);
}

export async function logout(): Promise<Settings> {
  return saveSettings({ token: null, user: null });
}
