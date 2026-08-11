import { POOLS } from "@/lib/pools";

export const metadata = { title: "DJ Pool Downloader — API" };

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <h1>DJ Pool Downloader — API</h1>
      <p>Бэкенд для расширения Chrome/Edge и PWA. Авторизация — Supabase JWT.</p>
      <h2>Роуты</h2>
      <ul>
        <li><code>POST /api/auth/register</code> — регистрация по инвайт-коду</li>
        <li><code>POST /api/auth/login</code> — вход по email+паролю</li>
        <li><code>GET|POST /api/auth/invites</code> — инвайт-коды (только админ)</li>
        <li><code>GET|POST /api/tracks</code>, <code>PATCH|DELETE /api/tracks/:id</code> — треки</li>
        <li><code>GET|POST|DELETE /api/favorites</code>, <code>PATCH /api/favorites/:id</code> — избранное</li>
        <li><code>GET|PATCH /api/settings</code> — настройки</li>
        <li><code>GET /api/pools</code> — реестр пулов</li>
      </ul>
      <h2>Подключённые пулы ({POOLS.length})</h2>
      <ul>
        {POOLS.map((p) => (
          <li key={p.id}>{p.name} — <code>{p.domain}</code></li>
        ))}
      </ul>
    </main>
  );
}
