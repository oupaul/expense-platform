-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "m365ClientId" TEXT,
ADD COLUMN     "m365Enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "m365TenantId" TEXT;
