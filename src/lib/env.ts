const requiredEnvKeys = [
  "DATABASE_URL",
  "NUVEMSHOP_CLIENT_ID",
  "NUVEMSHOP_CLIENT_SECRET",
  "NUVEMSHOP_APP_URL",
  "COMPRE_JUNTO_ADMIN_SECRET",
  "CATALOG_SYNC_SECRET",
] as const;

type RequiredEnvKey = (typeof requiredEnvKeys)[number];

const NUVEMSHOP_CALLBACK_URL =
  "https://compre-junto-nuvemshop-production.up.railway.app/api/nuvemshop/callback";

export type AppEnv = Record<RequiredEnvKey, string>;

let cachedEnv: AppEnv | null = null;

function readRequiredEnv(key: RequiredEnvKey): string {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = {
    DATABASE_URL: readRequiredEnv("DATABASE_URL"),
    NUVEMSHOP_CLIENT_ID: readRequiredEnv("NUVEMSHOP_CLIENT_ID"),
    NUVEMSHOP_CLIENT_SECRET: readRequiredEnv("NUVEMSHOP_CLIENT_SECRET"),
    NUVEMSHOP_APP_URL: normalizeBaseUrl(readRequiredEnv("NUVEMSHOP_APP_URL")),
    COMPRE_JUNTO_ADMIN_SECRET: readRequiredEnv("COMPRE_JUNTO_ADMIN_SECRET"),
    CATALOG_SYNC_SECRET: readRequiredEnv("CATALOG_SYNC_SECRET"),
  };

  return cachedEnv;
}

export function getNuvemshopCallbackUrl(): string {
  return NUVEMSHOP_CALLBACK_URL;
}
