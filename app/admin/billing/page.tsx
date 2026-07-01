import Link from "next/link";

import { BillingCheckoutAction } from "@/app/admin/billing/billing-checkout-action";
import { getBillingPlanConfig, getCommercialStatus } from "@/src/lib/billing/commercial-status";
import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BillingPageProps = {
  searchParams?: Promise<{
    checkout?: string | string[] | undefined;
  }>;
};

function getCheckoutFeedback(checkout: string | string[] | undefined) {
  return checkout === "return" || (Array.isArray(checkout) && checkout.includes("return"));
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleString("pt-BR") : "Nao informado";
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = searchParams ? await searchParams : {};
  const store = await getConnectedStore();
  const access = store ? await getCommercialStatus(store.id) : null;
  const plan = getBillingPlanConfig();
  const showCheckoutReturn = getCheckoutFeedback(params.checkout);
  const disabledReason = !plan.mercadoPagoPlanId
    ? "Configure COMPRE_JUNTO_MP_PLAN_ID para habilitar checkout."
    : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl bg-zinc-50 px-6 py-10 text-zinc-950">
      <header className="border-b border-zinc-200 pb-6">
        <Link href="/admin/ofertas" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
          Voltar para ofertas
        </Link>
        <p className="mt-5 text-sm font-medium uppercase tracking-wide text-zinc-500">Compre Junto</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Billing Mercado Pago</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Controle comercial do plano Compre Junto Pro sem alterar o widget NubeSDK validado em producao.
        </p>
      </header>

      {showCheckoutReturn ? (
        <section className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          Retorno do Mercado Pago recebido. O status final sera confirmado pelo webhook.
        </section>
      ) : null}

      {!store ? (
        <section className="mt-8 rounded-md border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Loja nao conectada</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Conecte uma loja pela instalacao da Nuvemshop antes de iniciar uma assinatura.
          </p>
        </section>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="grid gap-5">
            <div className="rounded-md border border-zinc-200 bg-white p-6">
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Plano</p>
              <h2 className="mt-2 text-2xl font-semibold">{plan.name}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {plan.priceLabel}. Trial configuravel de {plan.trialDays} dias.
              </p>
              <dl className="mt-5 grid gap-3 text-sm text-zinc-600">
                <div className="flex items-center justify-between gap-4">
                  <dt className="font-medium text-zinc-800">Loja Nuvemshop</dt>
                  <dd>{store.nuvemshopStoreId}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="font-medium text-zinc-800">Status interno</dt>
                  <dd>{access?.status ?? "BLOCKED"}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="font-medium text-zinc-800">Status Mercado Pago</dt>
                  <dd>{access?.externalStatus ?? "Nao informado"}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="font-medium text-zinc-800">Periodo atual</dt>
                  <dd>{formatDate(access?.currentPeriodEnd ?? null)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="font-medium text-zinc-800">Feature flag</dt>
                  <dd>{access?.modeLabel ?? (plan.enforcementEnabled ? "Enforcement ativo" : "Modo teste")}</dd>
                </div>
              </dl>
            </div>

            <section className="rounded-md border border-zinc-200 bg-white p-6">
              <h2 className="text-lg font-semibold">Status comercial</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {access?.message ?? "Nenhum status comercial encontrado para esta loja."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700 ring-1 ring-zinc-200">
                  {plan.enforcementEnabled ? "bloqueio ativo" : "bloqueio desligado"}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700 ring-1 ring-zinc-200">
                  plan id {plan.mercadoPagoPlanId ? "configurado" : "nao configurado"}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700 ring-1 ring-zinc-200">
                  webhook secret {plan.webhookSecretConfigured ? "configurado" : "ausente"}
                </span>
              </div>
            </section>
          </section>

          <aside className="grid content-start gap-4">
            <BillingCheckoutAction defaultEmail={store.email ?? null} disabledReason={disabledReason} />
            <section className="rounded-md border border-zinc-200 bg-white p-5 text-sm leading-6 text-zinc-600">
              <h2 className="font-semibold text-zinc-900">Operacao segura</h2>
              <p className="mt-2">
                Com o enforcement desligado, o admin e a API publica continuam liberados enquanto o billing e validado.
              </p>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
