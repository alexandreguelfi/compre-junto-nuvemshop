CREATE TYPE "CommercialStatus" AS ENUM ('TRIALING', 'ACTIVE', 'EXPIRED', 'CANCELED');

ALTER TABLE "Store"
ADD COLUMN "commercialStatus" "CommercialStatus" NOT NULL DEFAULT 'TRIALING',
ADD COLUMN "trialStartedAt" TIMESTAMP(3),
ADD COLUMN "trialEndsAt" TIMESTAMP(3);

UPDATE "Store"
SET
  "trialStartedAt" = CURRENT_TIMESTAMP,
  "trialEndsAt" = CURRENT_TIMESTAMP + INTERVAL '7 days'
WHERE "trialStartedAt" IS NULL
   OR "trialEndsAt" IS NULL;

CREATE INDEX "Store_commercialStatus_idx" ON "Store"("commercialStatus");
CREATE INDEX "Store_trialEndsAt_idx" ON "Store"("trialEndsAt");
