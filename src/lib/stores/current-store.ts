import { prisma } from "@/src/lib/prisma";

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

export async function getConnectedStore() {
  try {
    return await prisma.store.findFirst({
      where: {
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
  } catch (error) {
    console.warn("Connected store lookup failed.", getSafeStoreLookupError(error));

    return null;
  }
}
