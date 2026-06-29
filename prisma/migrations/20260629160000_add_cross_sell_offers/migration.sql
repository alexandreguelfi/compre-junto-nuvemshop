-- CreateTable
CREATE TABLE "CrossSellOffer" (
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
CREATE TABLE "CrossSellOfferTrigger" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "triggerProductId" TEXT NOT NULL,
    "triggerProductName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossSellOfferTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrossSellOffer_storeId_isActive_idx" ON "CrossSellOffer"("storeId", "isActive");

-- CreateIndex
CREATE INDEX "CrossSellOffer_storeId_createdAt_idx" ON "CrossSellOffer"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrossSellOfferTrigger_offerId_triggerProductId_key" ON "CrossSellOfferTrigger"("offerId", "triggerProductId");

-- CreateIndex
CREATE INDEX "CrossSellOfferTrigger_offerId_idx" ON "CrossSellOfferTrigger"("offerId");

-- AddForeignKey
ALTER TABLE "CrossSellOffer" ADD CONSTRAINT "CrossSellOffer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossSellOfferTrigger" ADD CONSTRAINT "CrossSellOfferTrigger_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CrossSellOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
