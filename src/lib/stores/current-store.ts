import { prisma } from "@/src/lib/prisma";

const connectedStoreWhere = {
  AND: [
    {
      accessTokenCiphertext: {
        not: null,
      },
    },
    {
      accessTokenCiphertext: {
        not: "",
      },
    },
  ],
};

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

function getLookupReason(
  connectedStore: { id: string } | null,
  latestStore: { accessTokenCiphertext: string | null } | null,
) {
  if (connectedStore) {
    return "connected_store_found";
  }

  if (!latestStore) {
    return "no_stores_found";
  }

  if (latestStore.accessTokenCiphertext === null) {
    return "latest_store_token_null";
  }

  if (latestStore.accessTokenCiphertext === "") {
    return "latest_store_token_empty";
  }

  return "no_matching_connected_store";
}

export async function getConnectedStore() {
  try {
    const [storesFound, storesWithFilledToken, connectedStore, latestStore] = await prisma.$transaction([
      prisma.store.count(),
      prisma.store.count({
        where: connectedStoreWhere,
      }),
      prisma.store.findFirst({
        where: connectedStoreWhere,
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          id: true,
          createdAt: true,
          nuvemshopStoreId: true,
          updatedAt: true,
        },
      }),
      prisma.store.findFirst({
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          id: true,
          accessTokenCiphertext: true,
          nuvemshopStoreId: true,
          updatedAt: true,
        },
      }),
    ]);

    console.info("Connected store lookup diagnostic.", {
      storesFound,
      storesWithFilledToken,
      hasFilledToken: storesWithFilledToken > 0,
      selectedStoreId: connectedStore?.id ?? null,
      selectedProviderStoreId: connectedStore?.nuvemshopStoreId ?? null,
      selectedUpdatedAt: connectedStore?.updatedAt.toISOString() ?? null,
      latestStoreId: latestStore?.id ?? null,
      latestProviderStoreId: latestStore?.nuvemshopStoreId ?? null,
      latestUpdatedAt: latestStore?.updatedAt.toISOString() ?? null,
      reason: getLookupReason(connectedStore, latestStore),
    });

    return connectedStore;
  } catch (error) {
    console.warn("Connected store lookup failed.", getSafeStoreLookupError(error));

    return null;
  }
}
