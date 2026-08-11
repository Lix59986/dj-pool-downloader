# DJ Pool Downloader — Backend (Next.js + Supabase)

Бэкенд для расширения Chrome/Edge (MV3) и PWA. Деплой: Vercel. БД и Auth: Supabase.

## Роуты

| Метод | Роут | Описание |
|---|---|---|
| POST | `/api/auth/register` | регистрация `{email, password, invite_code}` |
| POST | `/api/auth/login` | вход `{email, password}` → сессия |
| GET/POST | `/api/auth/invites` | инвайт-коды (только админ) |
| GET/POST | `/api/tracks` | список / создание (upsert по `user_id+artist_eff+title`) |
| PATCH/DELETE | `/api/tracks/:id` | обновить / удалить трек |
| GET/POST/DELETE | `/api/favorites` | избранное (`?pool=`, `?status=`) |
| PATCH | `/api/favorites/:id` | статус/путь после скачивания |
| GET/PATCH | `/api/settings` | настройки пользователя |
| GET | `/api/pools` | реестр пулов |
| GET | `/api/health` | health-check |

Авторизация: `Authorization: Bearer <jwt>` (Supabase). RLS на всех таблицах.

## Схема БД

`supabase/migrations/001_init.sql` — таблицы `profiles`, `invites`, `tracks`, `favorites`, `settings` + RLS-политики + триггер + seed.

## Запуск

```bash
npm install
cp .env.example .env.local   # впиши реальные ключи
npm run dev
```

## Деплой

Подробная инструкция — в [DEPLOY.md](DEPLOY.md).
