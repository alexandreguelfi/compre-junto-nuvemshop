import { StoreStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getConnectedStore() {
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
        installedAt: true,
        nuvemshopStoreId: true,
        updatedAt: true,
      },
    });
  } catch {
    return null;
  }
}

export default async function AdminPage() {
  const connectedStore = await getConnectedStore();
  const isConnected = Boolean(connectedStore);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-16 text-zinc-950">
      <section className="w-full max-w-xl space-y-5">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Compre Junto</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {isConnected ? "Loja conectada" : "Aguardando instalacao"}
        </h1>
        <p className="text-base leading-7 text-zinc-600">
          {isConnected
            ? "A instalacao foi concluida. A base do app reconheceu a loja e pode preparar as proximas etapas do painel."
            : "Instale o app pela Nuvemshop para conectar uma loja e validar o fluxo inicial."}
        </p>
        {connectedStore ? (
          <dl className="grid gap-3 border-t border-zinc-200 pt-5 text-sm text-zinc-600">
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-800">Status</dt>
              <dd>Conectada</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-800">Loja Nuvemshop</dt>
              <dd>{connectedStore.nuvemshopStoreId}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-800">Instalada em</dt>
              <dd>{connectedStore.installedAt.toLocaleString("pt-BR")}</dd>
            </div>
          </dl>
        ) : null}
      </section>
    </main>
  );
}
