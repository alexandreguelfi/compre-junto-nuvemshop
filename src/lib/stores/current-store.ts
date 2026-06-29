import { prisma } from "@/src/lib/prisma";

export async function getConnectedStore() {
  try {
    return await prisma.store.findFirst({
      where: {
        accessTokenCiphertext: {
          not: null,
        },
        disconnectedAt: null,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        createdAt: true,
        nuvemshopStoreId: true,
        updatedAt: true,
      },
    });
  } catch {
    return null;
  }
}
