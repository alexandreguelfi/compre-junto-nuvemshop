import Link from "next/link";

import { CommercialStatusBanner } from "@/app/admin/commercial-status-banner";
import { resolveStoreCommercialAccess } from "@/src/lib/billing/commercial-status";
import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminPage() {
  const connectedStore = await getConnectedStore();
  const isConnected = Boolean(connectedStore);
  const commercialAccess = connectedStore ? resolveStoreCommercialAccess(connectedStore) : null;

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
          <>
            {commercialAccess ? <CommercialStatusBanner access={commercialAccess} /> : null}
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
                <dt className="font-medium text-zinc-800">Registrada em</dt>
                <dd>{connectedStore.createdAt.toLocaleString("pt-BR")}</dd>
              </div>
            </dl>
            <Link
              href="/admin/ofertas"
              className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Gerenciar ofertas
            </Link>
          </>
        ) : null}
      </section>
    </main>
  );
}
