# DJ Pool Downloader — расширение Chrome/Edge (MV3)

Скачивание и классификация музыки с диджейских пулов в папку `muzz` + экспорт Rekordbox XML.

## Установка (разработка)

1. `npm install`
2. `npm run dev` (HMR) или `npm run build` (одноразовая сборка)
3. Открой `chrome://extensions` (или `edge://extensions`)
4. Включи **«Режим разработчика»**
5. **«Загрузить распакованное расширение»** → выбери папку `dist/`

## Что умеет сейчас (этап 2a)

- Перехватывает скачивания аудио с пулов (jesteipool, muzvizor, 36pool + их S3)
- Классифицирует по имени файла: артист/название, язык, часть ночи
- Раскладывает в `muzz/...` по выбранному режиму (по умолчанию `night`)
- Маленькие файлы (< 2.5 MB) считает превью → `muzz/_preview/`
- Пишет метаданные в IndexedDB; дубликаты не плодятся

## Тесты

```bash
npm test
```

## Структура

```
src/
├── background/   service worker: перехват скачиваний
├── popup/        UI расширения
├── content/      content scripts (этап 2c — кнопки на страницах пулов)
└── lib/
    ├── types.ts, db.ts (IndexedDB), storage.ts (chrome.storage)
    ├── normalize.ts, classify.ts, genre_map.ts
    └── path.ts   (раскладка файлов по папкам)
```

## Дальше по плану

- 2b — Rekordbox XML + M3U8 + popup (вход/настройки/избранное)
- 2c — коннекторы пулов (поиск по API) + кнопки на страницах
- 3 — синхронизация с бэкендом (Vercel + Supabase)
