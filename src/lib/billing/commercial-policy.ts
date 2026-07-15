export type EntitlementBillingStatus = "TRIAL" | "ACTIVE" | "PENDING" | "PAST_DUE" | "CANCELED" | "BLOCKED";

export function normalizeTimeBoundBillingStatus(
  status: EntitlementBillingStatus,
  trialEndsAt: Date,
  now: Date,
): EntitlementBillingStatus {
  return status === "TRIAL" && now.getTime() > trialEndsAt.getTime() ? "PAST_DUE" : status;
}

export function hasCommercialEntitlement(status: EntitlementBillingStatus) {
  return status === "ACTIVE" || status === "TRIAL";
}

export function canAccessCommercialFeatures(status: EntitlementBillingStatus, enforcementEnabled: boolean) {
  return !enforcementEnabled || hasCommercialEntitlement(status);
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function readBoundedTrialDays(value: string | undefined, fallback: number, maximum = 90) {
  if (!value || !/^\d+$/.test(value.trim())) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

export function repairTrialDates(
  store: { createdAt: Date; installedAt: Date | null; trialEndsAt: Date | null; trialStartedAt: Date | null },
  trialDays: number,
) {
  const trialStartedAt = store.trialStartedAt ?? store.installedAt ?? store.createdAt;
  return {
    trialStartedAt,
    trialEndsAt: store.trialEndsAt ?? new Date(trialStartedAt.getTime() + trialDays * DAY_IN_MS),
  };
}
