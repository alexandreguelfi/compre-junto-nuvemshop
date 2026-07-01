import { prisma } from "@/src/lib/prisma";

export const COMPRE_JUNTO_PLAN = {
  name: "Compre Junto Pro",
  price: 49,
  priceLabel: "R$ 49,00/mes",
  trialDays: 7,
} as const;

export type CommercialStatus = "TRIALING" | "ACTIVE" | "EXPIRED" | "CANCELED";

export type BillingStatus = "TRIAL" | "ACTIVE" | "PENDING" | "PAST_DUE" | "CANCELED" | "BLOCKED";

export type StoreCommercialFields = {
  commercialStatus: CommercialStatus;
  createdAt?: Date | null;
  installedAt?: Date | null;
  trialEndsAt?: Date | null;
  trialStartedAt?: Date | null;
};

type BillingSubscriptionFields = {
  checkoutUrl?: string | null;
  currentPeriodEnd?: Date | null;
  externalStatus?: string | null;
  initPoint?: string | null;
  providerPlanId?: string | null;
  providerSubscriptionId?: string | null;
  status: BillingStatus;
  trialEndsAt?: Date | null;
};

export type BillingPlanConfig = {
  enforcementEnabled: boolean;
  hasMercadoPagoAccessToken: boolean;
  mercadoPagoPlanId: string | null;
  name: string;
  price: number;
  priceLabel: string;
  trialDays: number;
  webhookSecretConfigured: boolean;
};

export type StoreCommercialAccess = {
  canCreateOffer: boolean;
  canDisplayWidget: boolean;
  canUseApp: boolean;
  checkoutUrl: string | null;
  currentPeriodEnd: Date | null;
  daysRemaining: number;
  enforcementEnabled: boolean;
  externalStatus: string | null;
  hasEntitlement: boolean;
  initPoint: string | null;
  message: string;
  modeLabel: string;
  planName: string;
  planPriceLabel: string;
  providerPlanId: string | null;
  providerSubscriptionId: string | null;
  status: BillingStatus;
  trialEndsAt: Date;
  trialStartedAt: Date;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_IN_MS);
}

function cleanEnv(value: string | undefined): string | null {
  return value?.trim() || null;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const normalized = value?.replace(",", ".") ?? "";
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatPriceLabel(price: number): string {
  return `R$ ${price.toFixed(2).replace(".", ",")}/mes`;
}

function getTrialStartedAt(store: StoreCommercialFields, now: Date) {
  return store.trialStartedAt ?? store.installedAt ?? store.createdAt ?? now;
}

function getTrialEndsAt(store: StoreCommercialFields, trialStartedAt: Date, trialDays: number) {
  return store.trialEndsAt ?? addDays(trialStartedAt, trialDays);
}

function getDaysRemaining(now: Date, trialEndsAt: Date) {
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_IN_MS));
}

function isTrialActive(now: Date, trialEndsAt: Date) {
  return now.getTime() <= trialEndsAt.getTime();
}

function formatTrialMessage(daysRemaining: number) {
  const unit = daysRemaining === 1 ? "dia restante" : "dias restantes";

  return `Periodo gratis: ${daysRemaining} ${unit}.`;
}

function isActiveBillingStatus(status: BillingStatus) {
  return status === "ACTIVE" || status === "TRIAL";
}

function normalizeSubscriptionStatus(
  subscription: BillingSubscriptionFields,
  now: Date,
  fallbackTrialEndsAt: Date,
): BillingStatus {
  const trialEndsAt = subscription.trialEndsAt ?? fallbackTrialEndsAt;

  if (subscription.status === "TRIAL" && !isTrialActive(now, trialEndsAt)) {
    return "PAST_DUE";
  }

  return subscription.status;
}

function resolveLegacyBillingStatus(store: StoreCommercialFields, now: Date, trialEndsAt: Date): BillingStatus {
  if (store.commercialStatus === "ACTIVE") {
    return "ACTIVE";
  }

  if (store.commercialStatus === "CANCELED") {
    return "CANCELED";
  }

  if (store.commercialStatus === "TRIALING" && isTrialActive(now, trialEndsAt)) {
    return "TRIAL";
  }

  return "PAST_DUE";
}

function getStatusMessage(args: {
  daysRemaining: number;
  enforcementEnabled: boolean;
  hasEntitlement: boolean;
  planName: string;
  planPriceLabel: string;
  status: BillingStatus;
}) {
  if (!args.enforcementEnabled && !args.hasEntitlement) {
    return `Ambiente de validacao: acesso liberado enquanto finalizamos a assinatura. Status atual: ${args.status}.`;
  }

  if (!args.enforcementEnabled) {
    return `Ambiente de validacao: acesso liberado para testes. ${args.status === "TRIAL" ? formatTrialMessage(args.daysRemaining) : `${args.planName} ativo.`}`;
  }

  if (args.status === "ACTIVE") {
    return `${args.planName} ativo.`;
  }

  if (args.status === "TRIAL") {
    return formatTrialMessage(args.daysRemaining);
  }

  if (args.status === "PENDING") {
    return `Assinatura em andamento. Conclua o pagamento do ${args.planName} para liberar o app.`;
  }

  if (args.status === "CANCELED") {
    return `Assinatura cancelada. Reative o ${args.planName} por ${args.planPriceLabel} para continuar.`;
  }

  if (args.status === "BLOCKED") {
    return `Acesso temporariamente bloqueado. Regularize o ${args.planName} para continuar.`;
  }

  return `Pagamento pendente. Regularize o ${args.planName} por ${args.planPriceLabel} para continuar usando o app.`;
}

export function getBillingPlanConfig(): BillingPlanConfig {
  const price = readPositiveNumber(process.env.COMPRE_JUNTO_PRICE, COMPRE_JUNTO_PLAN.price);
  const trialDays = readPositiveInteger(process.env.COMPRE_JUNTO_TRIAL_DAYS, COMPRE_JUNTO_PLAN.trialDays);

  return {
    enforcementEnabled: process.env.BILLING_ENFORCEMENT_ENABLED?.trim().toLowerCase() === "true",
    hasMercadoPagoAccessToken: Boolean(cleanEnv(process.env.MERCADO_PAGO_ACCESS_TOKEN)),
    mercadoPagoPlanId: cleanEnv(process.env.COMPRE_JUNTO_MP_PLAN_ID),
    name: COMPRE_JUNTO_PLAN.name,
    price,
    priceLabel: formatPriceLabel(price),
    trialDays,
    webhookSecretConfigured: Boolean(cleanEnv(process.env.MERCADOPAGO_WEBHOOK_SECRET)),
  };
}

export function isBillingEnforcementEnabled() {
  return getBillingPlanConfig().enforcementEnabled;
}

export function mapMercadoPagoStatusToInternalStatus(status: string | null | undefined): BillingStatus {
  const normalized = status?.trim().toLowerCase();

  if (normalized === "authorized" || normalized === "active" || normalized === "approved") {
    return "ACTIVE";
  }

  if (normalized === "paused" || normalized === "in_process" || normalized === "past_due") {
    return "PAST_DUE";
  }

  if (normalized === "cancelled" || normalized === "canceled") {
    return "CANCELED";
  }

  if (normalized === "blocked") {
    return "BLOCKED";
  }

  return "PENDING";
}

export function mapInternalStatusToStoreCommercialStatus(status: BillingStatus): CommercialStatus {
  if (status === "ACTIVE") {
    return "ACTIVE";
  }

  if (status === "TRIAL") {
    return "TRIALING";
  }

  if (status === "CANCELED") {
    return "CANCELED";
  }

  return "EXPIRED";
}

export function resolveStoreCommercialAccess(
  store: StoreCommercialFields,
  now = new Date(),
  subscription: BillingSubscriptionFields | null = null,
): StoreCommercialAccess {
  const config = getBillingPlanConfig();
  const trialStartedAt = getTrialStartedAt(store, now);
  const fallbackTrialEndsAt = getTrialEndsAt(store, trialStartedAt, config.trialDays);
  const trialEndsAt = subscription?.trialEndsAt ?? fallbackTrialEndsAt;
  const daysRemaining = getDaysRemaining(now, trialEndsAt);
  const status = subscription
    ? normalizeSubscriptionStatus(subscription, now, fallbackTrialEndsAt)
    : resolveLegacyBillingStatus(store, now, fallbackTrialEndsAt);
  const hasEntitlement = isActiveBillingStatus(status);
  const canUseApp = config.enforcementEnabled ? hasEntitlement : true;

  return {
    canCreateOffer: canUseApp,
    canDisplayWidget: canUseApp,
    canUseApp,
    checkoutUrl: subscription?.checkoutUrl ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    daysRemaining,
    enforcementEnabled: config.enforcementEnabled,
    externalStatus: subscription?.externalStatus ?? null,
    hasEntitlement,
    initPoint: subscription?.initPoint ?? null,
    message: getStatusMessage({
      daysRemaining,
      enforcementEnabled: config.enforcementEnabled,
      hasEntitlement,
      planName: config.name,
      planPriceLabel: config.priceLabel,
      status,
    }),
    modeLabel: config.enforcementEnabled ? "Controle comercial ativo" : "Acesso liberado para testes",
    planName: config.name,
    planPriceLabel: config.priceLabel,
    providerPlanId: subscription?.providerPlanId ?? null,
    providerSubscriptionId: subscription?.providerSubscriptionId ?? null,
    status,
    trialEndsAt,
    trialStartedAt,
  };
}

export async function getCommercialStatus(storeId: string): Promise<StoreCommercialAccess | null> {
  const store = await prisma.store.findUnique({
    where: {
      id: storeId,
    },
    select: {
      commercialStatus: true,
      createdAt: true,
      installedAt: true,
      trialEndsAt: true,
      trialStartedAt: true,
    },
  });

  if (!store) {
    return null;
  }

  const subscription = await prisma.billingSubscription.findFirst({
    where: {
      storeId,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      checkoutUrl: true,
      currentPeriodEnd: true,
      externalStatus: true,
      initPoint: true,
      providerPlanId: true,
      providerSubscriptionId: true,
      status: true,
      trialEndsAt: true,
    },
  });

  return resolveStoreCommercialAccess(store, new Date(), subscription);
}

export async function canUseApp(storeId: string): Promise<boolean> {
  const access = await getCommercialStatus(storeId);

  return access?.canUseApp ?? false;
}
