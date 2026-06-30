export const COMPRE_JUNTO_PLAN = {
  name: "Compre Junto Pro",
  priceLabel: "R$ 49/mês",
  trialDays: 7,
} as const;

export type CommercialStatus = "TRIALING" | "ACTIVE" | "EXPIRED" | "CANCELED";

export type StoreCommercialFields = {
  commercialStatus: CommercialStatus;
  createdAt?: Date | null;
  installedAt?: Date | null;
  trialEndsAt?: Date | null;
  trialStartedAt?: Date | null;
};

export type StoreCommercialAccess = {
  canCreateOffer: boolean;
  canDisplayWidget: boolean;
  daysRemaining: number;
  message: string;
  planName: string;
  planPriceLabel: string;
  status: CommercialStatus;
  trialEndsAt: Date;
  trialStartedAt: Date;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_IN_MS);
}

function getTrialStartedAt(store: StoreCommercialFields, now: Date) {
  return store.trialStartedAt ?? store.installedAt ?? store.createdAt ?? now;
}

function getTrialEndsAt(store: StoreCommercialFields, trialStartedAt: Date) {
  return store.trialEndsAt ?? addDays(trialStartedAt, COMPRE_JUNTO_PLAN.trialDays);
}

function getDaysRemaining(now: Date, trialEndsAt: Date) {
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_IN_MS));
}

function formatTrialMessage(daysRemaining: number) {
  const unit = daysRemaining === 1 ? "dia restante" : "dias restantes";

  return `Teste grátis: ${daysRemaining} ${unit}.`;
}

export function resolveStoreCommercialAccess(
  store: StoreCommercialFields,
  now = new Date(),
): StoreCommercialAccess {
  const trialStartedAt = getTrialStartedAt(store, now);
  const trialEndsAt = getTrialEndsAt(store, trialStartedAt);
  const daysRemaining = getDaysRemaining(now, trialEndsAt);
  const rawStatus = store.commercialStatus;
  const isTrialActive = now.getTime() <= trialEndsAt.getTime();

  if (rawStatus === "ACTIVE") {
    return {
      canCreateOffer: true,
      canDisplayWidget: true,
      daysRemaining,
      message: `${COMPRE_JUNTO_PLAN.name} ativo.`,
      planName: COMPRE_JUNTO_PLAN.name,
      planPriceLabel: COMPRE_JUNTO_PLAN.priceLabel,
      status: "ACTIVE",
      trialEndsAt,
      trialStartedAt,
    };
  }

  if (rawStatus === "TRIALING" && isTrialActive) {
    return {
      canCreateOffer: true,
      canDisplayWidget: true,
      daysRemaining,
      message: formatTrialMessage(daysRemaining),
      planName: COMPRE_JUNTO_PLAN.name,
      planPriceLabel: COMPRE_JUNTO_PLAN.priceLabel,
      status: "TRIALING",
      trialEndsAt,
      trialStartedAt,
    };
  }

  return {
    canCreateOffer: false,
    canDisplayWidget: false,
    daysRemaining: 0,
    message: `Teste grátis vencido. Assine o ${COMPRE_JUNTO_PLAN.name} por ${COMPRE_JUNTO_PLAN.priceLabel} para continuar.`,
    planName: COMPRE_JUNTO_PLAN.name,
    planPriceLabel: COMPRE_JUNTO_PLAN.priceLabel,
    status: rawStatus === "CANCELED" ? "CANCELED" : "EXPIRED",
    trialEndsAt,
    trialStartedAt,
  };
}
