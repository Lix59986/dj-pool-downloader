-- ============================================================
-- DJ Pool Downloader — миграция 001: схема + RLS + политики + seed
-- Применяется: supabase db push (или SQL Editor в панели Supabase)
-- ============================================================

-- ---------- Расширения ----------
create extension if not exists "pgcrypto"; -- gen_random_uuid()
create extension if not exists "citext";   -- email без регистро-зависимых дубликатов

-- ---------- Таблица: профили пользователей ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  role text not null default 'user',          -- 'user' | 'admin'
  created_at timestamptz default now()
);

-- ---------- Таблица: инвайт-коды ----------
create table public.invites (
  code text primary key,                       -- код, выдаётся администратором
  email citext,                                -- email, на который выдан код (если ограничен)
  created_by uuid references auth.users(id),   -- кто выдал (админ)
  used_by uuid references auth.users(id),      -- кто активировал
  used_at timestamptz,
  created_at timestamptz default now()
);

-- ---------- Таблица: треки ----------
create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist text,
  artist_eff text not null,                    -- нормализованный артист (для групп/дубликатов)
  bpm numeric,
  key text,
  genres text[],                               -- наши группы (Поп, Хаус, ...)
  parts text[],                                -- Open/Primetime/Close (может быть несколько)
  lang text,                                   -- RU / Foreign
  rating int,                                  -- 1–5 (рейтинг пула)
  marks text[],                                -- маркировки (Русское, Знакомое, ...)
  pool text,                                   -- jesteipool | muzvizor | 36pool | ...
  preview boolean default false,
  comment text,
  local_path text,                             -- путь в Rekordbox (относительный)
  source_url text,                             -- источник (пул) трека
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (user_id, artist_eff, title)
);

-- ---------- Таблица: избранное ----------
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pool text not null,                          -- избранное РАЗДЕЛЬНОЕ по пулам
  track_id_on_pool text,
  title text not null,
  artist text,
  url text,                                    -- ссылка на трек ИЛИ на его скачивание
  meta jsonb,                                  -- {bpm, key, genres, parts, rating, marks}
  status text default 'new',                   -- new | done | preview | error
  local_path text,
  added_at timestamptz default now(),
  unique (user_id, pool, track_id_on_pool)
);

-- ---------- Таблица: настройки пользователя ----------
create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  download_folder text,                        -- папка загрузок браузера (абсолютная, для XML)
  layout text default 'night',                 -- night | artist | genre | flat
  template text,                               -- свой шаблон путей (опционально)
  updated_at timestamptz default now()
);

-- ---------- Индексы ----------
create index if not exists tracks_user_id_idx on public.tracks (user_id);
create index if not exists tracks_artist_eff_idx on public.tracks (artist_eff);
create index if not exists favorites_user_id_idx on public.favorites (user_id);
create index if not exists favorites_pool_idx on public.favorites (pool);
create index if not exists invites_used_by_idx on public.invites (used_by);

-- ---------- Row Level Security ----------
alter table public.profiles   enable row level security;
alter table public.invites    enable row level security;
alter table public.tracks     enable row level security;
alter table public.favorites  enable row level security;
alter table public.settings   enable row level security;

-- Профиль: пользователь видит/изменяет свой; админ видит всех
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid() or (select role from public.profiles where id = auth.uid()) = 'admin');

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

-- Инвайты: читает/пишет только админ (пользователь вообще не видит коды)
create policy "invites_admin_all"
  on public.invites for all
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Треки: только свои строки
create policy "tracks_select_own"
  on public.tracks for select
  using (user_id = auth.uid());

create policy "tracks_insert_own"
  on public.tracks for insert
  with check (user_id = auth.uid());

create policy "tracks_update_own"
  on public.tracks for update
  using (user_id = auth.uid());

create policy "tracks_delete_own"
  on public.tracks for delete
  using (user_id = auth.uid());

-- Избранное: только своё
create policy "favorites_select_own"
  on public.favorites for select
  using (user_id = auth.uid());

create policy "favorites_insert_own"
  on public.favorites for insert
  with check (user_id = auth.uid());

create policy "favorites_update_own"
  on public.favorites for update
  using (user_id = auth.uid());

create policy "favorites_delete_own"
  on public.favorites for delete
  using (user_id = auth.uid());

-- Настройки: только свои
create policy "settings_select_own"
  on public.settings for select
  using (user_id = auth.uid());

create policy "settings_insert_own"
  on public.settings for insert
  with check (user_id = auth.uid());

create policy "settings_update_own"
  on public.settings for update
  using (user_id = auth.uid());

-- ---------- Триггер: автосоздание профиля при регистрации ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Seed: первый администратор ----------
-- Email задаётся через переменную окружения ADMIN_EMAIL (замени ниже при необходимости).
-- Для создания админа у любого пользователя выполни:
--   update public.profiles set role = 'admin' where email = '<email>';
insert into public.profiles (id, email, role)
select id, email, 'admin'
from auth.users
where email = 'admin@djpool.local'
on conflict (id) do nothing;
