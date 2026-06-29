import Link from "next/link";

import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NewOfferPage() {
  const store = await getConnectedStore();

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-zinc-50 px-6 py-10 text-zinc-950">
      <header className="border-b border-zinc-200 pb-6">
        <Link href="/admin/ofertas" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
          Voltar para ofertas
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Criar oferta Compre Junto</h1>
      </header>

      {!store ? (
        <section className="mt-8 rounded-md border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Loja nao conectada</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Conecte uma loja pela instalacao da Nuvemshop antes de criar ofertas.
          </p>
        </section>
      ) : (
        <form action="/api/admin/ofertas" method="post" className="mt-8 grid gap-6">
          <section className="grid gap-5 rounded-md border border-zinc-200 bg-white p-6">
            <div>
              <h2 className="text-lg font-semibold">Qual produto voce quer sugerir como compre junto?</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Este e o item complementar que aparecera como sugestao para o cliente.
              </p>
            </div>
            <label className="grid gap-2 text-sm font-medium text-zinc-800">
              ID do produto sugerido
              <input
                name="suggestedProductId"
                required
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-zinc-800">
              Nome do produto sugerido
              <input
                name="suggestedProductName"
                required
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
              />
            </label>
          </section>

          <section className="grid gap-5 rounded-md border border-zinc-200 bg-white p-6">
            <div>
              <h2 className="text-lg font-semibold">Com quais produtos esse item pode ser oferecido junto?</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Nesta primeira versao, informe ao menos um produto onde a sugestao deve aparecer.
              </p>
            </div>
            <label className="grid gap-2 text-sm font-medium text-zinc-800">
              ID do produto onde a sugestao vai aparecer
              <input
                name="triggerProductId"
                required
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-zinc-800">
              Nome do produto onde a sugestao vai aparecer
              <input
                name="triggerProductName"
                required
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
              />
            </label>
          </section>

          <section className="grid gap-3 rounded-md border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Status ativa/inativa</h2>
            <label className="grid gap-2 text-sm font-medium text-zinc-800">
              Status
              <select
                name="isActive"
                defaultValue="true"
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
              >
                <option value="true">Ativa</option>
                <option value="false">Inativa</option>
              </select>
            </label>
          </section>

          <div className="flex justify-end gap-3 border-t border-zinc-200 pt-5">
            <Link
              href="/admin/ofertas"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Salvar oferta
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
