/** Реестр пулов: основной конфиг для расширения (этап 2c). */

export interface PoolConfig {
  id: string;
  name: string;
  domain: string;
  prefix: string; // префикс комментария в XML (JP, MV, 36, ...)
  searchUrl: string;
  builtin: boolean;
  hostPermissions: string[];
}

export const POOLS: PoolConfig[] = [
  {
    id: "jesteipool",
    name: "Jestei Pool",
    domain: "jesteipool.ru",
    prefix: "JP",
    searchUrl: "https://rest.jesteipool.ru/api/search/tracks",
    builtin: true,
    hostPermissions: ["*://jesteipool.ru/*", "*://rest.jesteipool.ru/*"],
  },
  {
    id: "muzvizor",
    name: "Muzvizor",
    domain: "muzvizor.com",
    prefix: "MV",
    searchUrl: "https://muzvizor.com/api/v1/tracks/",
    builtin: true,
    hostPermissions: ["*://muzvizor.com/*"],
  },
  {
    id: "36pool",
    name: "36pool",
    domain: "36pool.com",
    prefix: "36",
    searchUrl: "https://36pool.com/api/v1/tracks/search",
    builtin: true,
    hostPermissions: ["*://36pool.com/*"],
  },
];

/** Шаблонные пулы (этап 2c): коннекторы-шаблоны без пересборки. */
export const TEMPLATE_POOLS: PoolConfig[] = [
  { id: "bpmsupreme", name: "BPM Supreme", domain: "bpmsupreme.com", prefix: "BPM", searchUrl: "", builtin: false, hostPermissions: ["*://bpmsupreme.com/*"] },
  { id: "djcity", name: "DJcity", domain: "djcity.com", prefix: "DJC", searchUrl: "", builtin: false, hostPermissions: ["*://djcity.com/*"] },
  { id: "zipdj", name: "zipDJ", domain: "zipdj.com", prefix: "ZIP", searchUrl: "", builtin: false, hostPermissions: ["*://zipdj.com/*"] },
  { id: "digitaldjpool", name: "Digital DJ Pool", domain: "digitaldjpool.com", prefix: "DDP", searchUrl: "", builtin: false, hostPermissions: ["*://digitaldjpool.com/*"] },
  { id: "promoonly", name: "Promo Only", domain: "promoonly.com", prefix: "PO", searchUrl: "", builtin: false, hostPermissions: ["*://promoonly.com/*"] },
  { id: "mymp3pool", name: "MyMP3Pool", domain: "mymp3pool.com", prefix: "MP3", searchUrl: "", builtin: false, hostPermissions: ["*://mymp3pool.com/*"] },
  { id: "beatsource", name: "Beatsource", domain: "beatsource.com", prefix: "BS", searchUrl: "", builtin: false, hostPermissions: ["*://beatsource.com/*"] },
  { id: "djpoolrecords", name: "DJ Pool Records", domain: "djpoolrecords.com", prefix: "DPR", searchUrl: "", builtin: false, hostPermissions: ["*://djpoolrecords.com/*"] },
];
