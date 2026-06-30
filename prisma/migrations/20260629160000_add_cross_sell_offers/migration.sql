-- CreateTable
CREATE TABLE IF NOT EXISTS "CrossSellOffer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "suggestedProductId" TEXT NOT NULL,
    "suggestedProductName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossSellOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CrossSellOfferTrigger" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "triggerProductId" TEXT NOT NULL,
    "triggerProductName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossSellOfferTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CrossSellOffer_storeId_isActive_idx" ON "CrossSellOffer"("storeId", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CrossSellOffer_storeId_createdAt_idx" ON "CrossSellOffer"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CrossSellOfferTrigger_offerId_triggerProductId_key" ON "CrossSellOfferTrigger"("offerId", "triggerProductId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CrossSellOfferTrigger_offerId_idx" ON "CrossSellOfferTrigger"("offerId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CrossSellOffer_storeId_fkey'
    ) THEN
        ALTER TABLE "CrossSellOffer" ADD CONSTRAINT "CrossSellOffer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CrossSellOfferTrigger_offerId_fkey'
    ) THEN
        ALTER TABLE "CrossSellOfferTrigger" ADD CONSTRAINT "CrossSellOfferTrigger_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CrossSellOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
