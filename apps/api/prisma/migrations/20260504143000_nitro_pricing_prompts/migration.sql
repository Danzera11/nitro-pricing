-- Nitro Pricing: visible quote numbers and database-managed AI prompts.
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "quoteNumber" TEXT;

WITH numbered AS (
  SELECT id,
         'NP-' || EXTRACT(YEAR FROM "createdAt")::int || '-' || LPAD(ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM "createdAt")::int ORDER BY "createdAt", id)::text, 4, '0') AS generated_number
  FROM "Quote"
  WHERE "quoteNumber" IS NULL
)
UPDATE "Quote" q
SET "quoteNumber" = numbered.generated_number
FROM numbered
WHERE q.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS "Quote_quoteNumber_key" ON "Quote"("quoteNumber");

CREATE TABLE IF NOT EXISTS "AiPrompt" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiPrompt_pkey" PRIMARY KEY ("id")
);
