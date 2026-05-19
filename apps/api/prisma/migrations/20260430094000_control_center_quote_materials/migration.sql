-- AlterEnum
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'EDITING';
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'SAVED';
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'EXPORTED';

-- AlterTable
ALTER TABLE "MaterialKit" ADD COLUMN "serviceId" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "suggestedMaterials" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Quote" ADD COLUMN "exportedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "MaterialKit" ADD CONSTRAINT "MaterialKit_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
