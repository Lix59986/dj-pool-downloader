import { DB } from "../lib/db";
import { getSettings } from "../lib/storage";

const countEl = document.getElementById("count")!;
const statusEl = document.getElementById("status")!;
const refreshEl = document.getElementById("refresh")!;

async function refresh() {
  try {
    const [tracks, settings] = await Promise.all([DB.allTracks(), getSettings()]);
    countEl.textContent = String(tracks.length);
    statusEl.textContent = settings.user ? settings.user.email : "не залогинен";
  } catch (e) {
    statusEl.textContent = "ошибка базы";
  }
}

refreshEl.addEventListener("click", refresh);
void refresh();
