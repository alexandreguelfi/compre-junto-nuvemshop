import { cookies } from "next/headers";

import { prisma } from "@/src/lib/prisma";
import { ADMIN_STORE_COOKIE, readAdminStoreSession } from "@/src/lib/stores/admin-session";

const connectedStoreWhere = {
  accessTokenCiphertext: {
    not: null,
  },
  status: "CONNECTED" as const,
};

const connectedStoreSelect = {
  commercialStatus: true,
  createdAt: true,
  email: true,
  id: true,
  installedAt: true,
  nuvemshopStoreId: true,
  scopes: true,
  trialEndsAt: true,
  trialStartedAt: true,
  updatedAt: true,
} as const;

function getSafeStoreLookupError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return { reason: "unknown" };
  }

  const maybePrismaError = error as { code?: unknown; name?: unknown };

  return {
    code: typeof maybePrismaError.code === "string" ? maybePrismaError.code : undefined,
    name: typeof maybePrismaError.name === "string" ? maybePrismaError.name : undefined,
  };
}

export async function getConnectedStoreByProviderId(providerStoreId: string) {
  if (!/^\d+$/.test(providerStoreId)) {
    return null;
  }

  return prisma.store.findUnique({
    where: {
      nuvemshopStoreId: providerStoreId,
      ...connectedStoreWhere,
    },
    select: connectedStoreSelect,
  });
}

export async function getConnectedStore() {
  try {
    const cookieStore = await cookies();
    const providerStoreId = readAdminStoreSession(cookieStore.get(ADMIN_STORE_COOKIE)?.value);

    if (!providerStoreId) {
      console.info("Connected store lookup diagnostic.", { reason: "admin_store_session_unavailable" });
      return null;
    }

    const store = await getConnectedStoreByProviderId(providerStoreId);

    console.info("Connected store lookup diagnostic.", {
      providerStoreId,
      reason: store ? "connected_store_found" : "session_store_not_connected",
      storeId: store?.id ?? null,
    });

    return store;
  } catch (error) {
    console.warn("Connected store lookup failed.", getSafeStoreLookupError(error));
    return null;
  }
}
