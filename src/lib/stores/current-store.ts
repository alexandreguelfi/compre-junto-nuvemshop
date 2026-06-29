import { StoreStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/src/lib/prisma";

export async function getConnectedStore() {
  try {
    return await prisma.store.findFirst({
      where: {
        status: StoreStatus.CONNECTED,
        accessTokenCiphertext: {
          not: null,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        installedAt: true,
        nuvemshopStoreId: true,
        updatedAt: true,
      },
    });
  } catch {
    return null;
  }
}
