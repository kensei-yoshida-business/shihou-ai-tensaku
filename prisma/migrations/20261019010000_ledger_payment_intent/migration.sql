-- AlterTable
ALTER TABLE "CreditLedger" ADD COLUMN     "paymentIntentId" TEXT;

-- CreateIndex
CREATE INDEX "CreditLedger_paymentIntentId_idx" ON "CreditLedger"("paymentIntentId");

