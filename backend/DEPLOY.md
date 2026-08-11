# Деплой бэкенда (Vercel + Supabase)

Пошаговая инструкция для владельца. Всё на бесплатных тарифах.

## 1. Supabase (БД + Auth)

1. Зарегистрируйся на [supabase.com](https://supabase.com) (по email).
2. Создай проект: **New project** → имя (например `dj-pool-downloader`), пароль БД сохрани.
3. Дождись инициализации. Открой **SQL Editor** → вставь содержимое файла
   `supabase/migrations/001_init.sql` → **Run**.
   Это создаст таблицы (profiles, invites, tracks, favorites, settings), RLS-политики,
   триггер профилей и seed.
4. Назначь первого админа. В SQL Editor выполни (замени email):

   ```sql
   update public.profiles
   set role = 'admin'
   where email = 'ваш@email.ru';
   ```

5. Открой **Project Settings → API**. Скопируй:
   - **Project URL** → в `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → в `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** (⚠️ секретный) → в `SUPABASE_SERVICE_ROLE_KEY`

## 2. Vercel (хостинг API)

1. Зарегистрируйся на [vercel.com](https://vercel.com) (по email/GitHub).
2. **Add New → Project** → импортируй репозиторий с этим кодом (каталог `backend` —
   настрой **Root Directory** = `backend`).
3. В настройках проекта → **Environment Variables** добавь все переменные из `.env.example`.
4. **Deploy**. Домен будет вида `https://<project>.vercel.app`.

## 3. Проверка

- Открой `https://<project>.vercel.app/api/health` → `{"ok": true, ...}`.
- Зарегистрируй пользователя:
  ```bash
  curl -X POST https://<project>.vercel.app/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"user@mail.ru","password":"secret123","invite_code":"XXXXXXXX"}'
  ```
- Создай инвайт-код (под админом):
  ```bash
  curl -X POST https://<project>.vercel.app/api/auth/invites \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer <admin-jwt>" \
    -d '{"count": 3}'
  ```

## 4. Домен (рекомендуется для продакшена)

1. Купи домен (например, на reg.ru) или используй бесплатный `<project>.vercel.app`.
2. Vercel → проект → **Settings → Domains** → добавь домен, пропиши DNS.
3. В Supabase: **Authentication → URL Configuration** → добавь домен в разрешённые URL
   (иначе redirect-ссылки PWA не пройдут).
4. Если домен настроен — задай `CORS_ORIGIN = https://ваш-домен` в переменных Vercel
   и сделай re-deploy.

## 5. Локальная разработка

```bash
cd backend
cp .env.example .env.local   # впиши реальные ключи
npm install
npm run dev
```

Миграции повторно запускать не нужно (idempotent). Для продакшена: git push → Vercel деплойит сам.
