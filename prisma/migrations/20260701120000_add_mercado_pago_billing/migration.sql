CREATE TYPE "BillingProvider" AS ENUM ('MERCADO_PAGO');

CREATE TYPE "BillingStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PENDING', 'PAST_DUE', 'CANCELED', 'BLOCKED');

CREATE TABLE "BillingSubscription" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "provider" "BillingProvider" NOT NULL DEFAULT 'MERCADO_PAGO',
  "providerSubscriptionId" TEXT,
  "providerPlanId" TEXT,
  "status" "BillingStatus" NOT NULL DEFAULT 'TRIAL',
  "externalStatus" TEXT,
  "initPoint" TEXT,
  "checkoutUrl" TEXT,
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingSubscription_providerSubscriptionId_key"
  ON "BillingSubscription"("providerSubscriptionId");

CREATE INDEX "BillingSubscription_storeId_status_idx"
  ON "BillingSubscription"("storeId", "status");

CREATE INDEX "BillingSubscription_provider_providerSubscriptionId_idx"
  ON "BillingSubscription"("provider", "providerSubscriptionId");

CREATE INDEX "BillingSubscription_providerPlanId_idx"
  ON "BillingSubscription"("providerPlanId");

ALTER TABLE "BillingSubscription"
  ADD CONSTRAINT "BillingSubscription_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
