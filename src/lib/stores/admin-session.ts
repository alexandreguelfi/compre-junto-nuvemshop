import { getEnv } from "@/src/lib/env";
import { createSignedAdminStoreSession, readSignedAdminStoreSession } from "@/src/lib/stores/admin-session-signing";

export const ADMIN_STORE_COOKIE = "compre_junto_store";
export const ADMIN_STORE_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function createAdminStoreSession(providerStoreId: string, now = Date.now()) {
  return createSignedAdminStoreSession(providerStoreId, getEnv().COMPRE_JUNTO_ADMIN_SECRET, now);
}

export function readAdminStoreSession(value: string | null | undefined, now = Date.now()): string | null {
  return readSignedAdminStoreSession(
    value,
    getEnv().COMPRE_JUNTO_ADMIN_SECRET,
    ADMIN_STORE_SESSION_MAX_AGE_SECONDS,
    now,
  );
}
