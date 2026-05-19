ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'editor';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'visualizador';

ALTER TABLE "UserExternal"
  ADD COLUMN IF NOT EXISTS "username" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS "UserExternal_username_key" ON "UserExternal"("username");
